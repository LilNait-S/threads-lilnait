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

export async function fetchPosts({
  pageNumber = 1,
  pageSize = 20,
}: {
  pageNumber: number;
  pageSize: number;
}) {
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

/**
 * Recupera un hilo por su ID junto con sus datos asociados.
 * Esta función obtiene los datos del hilo de una base de datos MongoDB usando Mongoose.
 *
 * @param {string} id - El ID del hilo que se va a recuperar.
 * @returns {Promise<object>} Una promesa que se resuelve con los datos del hilo recuperado.
 * @throws {Error} Si ocurre un error al recuperar el hilo.
 */
export async function fetchThreadById({ id }: { id: string }) {
  // Establece una conexión a la base de datos
  connectToDB();

  try {
    // Recupera el hilo por su ID y rellena los datos relacionados
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      })
      .populate({
        path: "children",
        populate: [
          {
            path: "author",
            model: User,
            select: "_id id name parentId image",
          },
          {
            path: "children",
            model: Thread,
            populate: {
              path: "author",
              model: User,
              select: "_id id name parentId image",
            },
          },
        ],
      })
      .exec();

    return thread;
  } catch (error: any) {
    throw new Error(`Error fetching thread: ${error.message}`);
  }
}

/**
 * Agrega un comentario a un hilo existente.
 * Esta función agrega un comentario a un hilo en una base de datos MongoDB usando Mongoose.
 *
 * @param {string} options.threadId - El ID del hilo al que se agregará el comentario.
 * @param {string} options.commentText - El texto del comentario a agregar.
 * @param {string} options.userId - El ID del usuario que realiza el comentario.
 * @param {string} options.path - La ruta asociada al comentario.
 * @throws {Error} Si ocurre un error al agregar el comentario al hilo.
 */
export async function addCommentToThread({
  threadId,
  commentText,
  userId,
  path,
}: {
  threadId: string;
  commentText: string;
  userId: string;
  path: string;
}) {
  // Establece una conexión a la base de datos
  connectToDB();

  try {
    // Encuentra el hilo original al que se agregará el comentario
    const originalThread = await Thread.findById(threadId);

    if (!originalThread) {
      throw new Error("Thread not found");
    }

    // Crea un nuevo hilo para el comentario
    const commentThread = new Thread({
      text: commentText,
      author: userId,
      parentId: threadId,
    });

    // Guarda el hilo del comentario en la base de datos
    const savedCommentThread = await commentThread.save();

    // Agrega el ID del hilo de comentario al arreglo de hijos del hilo original
    originalThread.children.push(savedCommentThread._id);

    // Guarda el hilo original con la referencia al nuevo hilo de comentario
    await originalThread.save();

    // Revalida la ruta asociada
    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Error adding comment to thread: ${error.message}`);
  }
}
