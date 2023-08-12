"use server";

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import Community from "../models/community.model";
import { connectToDB } from "../mongoose";

interface Params {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}

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
      path: "community",
      model: Community,
    })
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

export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectToDB();

    const communityIdObject = await Community.findOne(
      { id: communityId },
      { _id: 1 }
    );

    const createdThread = await Thread.create({
      text,
      author,
      community: communityIdObject, // Assign communityId if provided, or leave it null for personal account
    });

    // Update User model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });

    if (communityIdObject) {
      // Update Community model
      await Community.findByIdAndUpdate(communityIdObject, {
        $push: { threads: createdThread._id },
      });
    }

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to create thread: ${error.message}`);
  }
}

/**
 * Recupera de manera recursiva todos los hilos secundarios y sus descendientes.
 * Esta función obtiene los hilos secundarios y sus descendientes de una base de datos MongoDB utilizando Mongoose.
 *
 * @param {object} opciones - Opciones para recuperar los hilos secundarios y descendientes.
 * @param {string} opciones.threadId - El ID del hilo del que se van a recuperar los descendientes.
 * @returns {Promise<any[]>} Una promesa que se resuelve con una lista de hilos secundarios y sus descendientes.
 */

async function fetchAllChildThreads({
  threadId,
}: {
  threadId: string;
}): Promise<any[]> {
  // Recupera los hilos secundarios del hilo padre
  const childThreads = await Thread.find({ parentId: threadId });

  const descendantThreads = [];
  for (const childThread of childThreads) {
    // Recupera los descendientes de manera recursiva para cada hilo secundario
    const descendants = await fetchAllChildThreads({
      threadId: childThread._id,
    });
    descendantThreads.push(childThread, ...descendants);
  }

  return descendantThreads;
}

/**
 * Elimina un hilo y sus hilos secundarios de manera recursiva.
 * Esta función elimina hilos y sus descendientes de una base de datos MongoDB utilizando Mongoose.
 *
 * @param {object} opciones - Opciones para eliminar el hilo y sus descendientes.
 * @param {string} opciones.id - El ID del hilo principal que se va a eliminar.
 * @param {string} opciones.path - La ruta asociada al hilo.
 * @throws {Error} Si ocurre un error al eliminar el hilo y sus descendientes.
 */

/* change to object params*/
export async function deleteThread({
  id,
  path,
}: {
  id: string;
  path: string;
}): Promise<void> {
  try {
    // Establece una conexión a la base de datos
    connectToDB();

    // Encuentra el hilo que se va a eliminar (el hilo principal)
    const mainThread = await Thread.findById(id).populate("author community");

    if (!mainThread) {
      throw new Error("thread not found");
    }

    // Recupera todos los hilos secundarios y sus descendientes de manera recursiva
    const descendantThreads = await fetchAllChildThreads({ threadId: id });

    // Obtiene todos los IDs de hilos descendientes, incluido el ID del hilo principal y los IDs de los hilos secundarios
    const descendantThreadIds = [
      id,
      ...descendantThreads.map((thread) => thread._id),
    ];

    // Extrae los IDs de autores y comunidades para actualizar los modelos de Usuario y Comunidad respectivamente
    const uniqueAuthorIds = new Set(
      [
        ...descendantThreads.map((thread) => thread.author?._id?.toString()), // Utiliza el encadenamiento opcional para manejar valores posiblemente undefined
        mainThread.author?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    const uniqueCommunityIds = new Set(
      [
        ...descendantThreads.map((thread) => thread.community?._id?.toString()), // Utiliza el encadenamiento opcional para manejar valores posiblemente undefined
        mainThread.community?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    // Elimina de manera recursiva los hilos secundarios y sus descendientes
    await Thread.deleteMany({ _id: { $in: descendantThreadIds } });

    // Actualiza el modelo de Usuario
    await User.updateMany(
      { _id: { $in: Array.from(uniqueAuthorIds) } },
      { $pull: { threads: { $in: descendantThreadIds } } }
    );

    // Actualiza el modelo de Comunidad
    await Community.updateMany(
      { _id: { $in: Array.from(uniqueCommunityIds) } },
      { $pull: { threads: { $in: descendantThreadIds } } }
    );

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to delete thread: ${error.message}`);
  }
}

/**
 * Recupera un hilo por su ID junto con sus datos asociados.
 * Esta función obtiene los datos del hilo desde una base de datos MongoDB utilizando Mongoose.
 *
 * @param {object} opciones - Opciones para recuperar el hilo por su ID.
 * @param {string} opciones.id - El ID del hilo que se va a recuperar.
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
      }) // Rellena el campo de autor con _id y nombre de usuario
      .populate({
        path: "community",
        model: Community,
        select: "_id id name image",
      }) // Rellena el campo de comunidad con _id y nombre
      .populate({
        path: "children", // Rellena el campo de hijos
        populate: [
          {
            path: "author", // Rellena el campo de autor dentro de los hijos
            model: User,
            select: "_id id name parentId image", // Selecciona solo los campos _id y nombre de usuario del autor
          },
          {
            path: "children", // Rellena el campo de hijos dentro de los hijos
            model: Thread, // El modelo de los hijos anidados (suponiendo que es el mismo modelo "Thread")
            populate: {
              path: "author", // Rellena el campo de autor dentro de los hijos anidados
              model: User,
              select: "_id id name parentId image", // Selecciona solo los campos _id y nombre de usuario del autor
            },
          },
        ],
      })
      .exec();

    return thread;
  } catch (error: any) {
    throw new Error(`Error al recuperar el hilo: ${error.message}`);
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
