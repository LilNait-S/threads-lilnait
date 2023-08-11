"use server";

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

interface Params {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}

interface paramsFetch {
  pageNumber: number;
  pageSize: number;
}

export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectToDB();

    const createdThread = await Thread.create({
      text,
      author,
      community: null,
    });

    // update user model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Error creating thread: ${error.message}`);
  }
}

/**
 * Recupera una lista de publicaciones (hilos de nivel superior) con paginación opcional.
 * Esta función obtiene publicaciones de una base de datos MongoDB usando Mongoose.
 *
 * @param {number} pageNumber - El número de página que se va a recuperar.
 * @param {number} pageSize - El número de publicaciones que se van a recuperar por página.
 * @returns {Object} Un objeto que contiene las publicaciones recuperadas y la información de paginación.
 */

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  // Establece una conexión a la base de datos
  connectToDB();

  // Calcula la cantidad de publicaciones a omitir según la paginación
  const skipAmount = (pageNumber - 1) * pageSize;

  // Construye una consulta para recuperar hilos de nivel superior (publicaciones sin padres)
  const postsQuery = Thread.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: "author", model: User }) // Rellena el campo de autor con datos de Usuario
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: User,
        select: "_id name parentId image",
      },
    }); // Rellena el campo de autor de los hijos con datos de Usuario

  // Cuenta el número total de hilos de nivel superior para la paginación
  const totalPostsCount = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  });

  // Ejecuta la consulta de publicaciones para recuperar datos
  const posts = await postsQuery.exec();

  // Verifica si hay más publicaciones disponibles para la próxima página
  const isNext = totalPostsCount > skipAmount + posts.length;

  // Devuelve las publicaciones recuperadas y la información de paginación
  return { posts, isNext };
}
