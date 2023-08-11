"use server";

import { FilterQuery, SortOrder } from "mongoose";
import { revalidatePath } from "next/cache";

import User from "../models/user.model";
import Thread from "../models/thread.model";

import { connectToDB } from "../mongoose";

interface Params {
  userId: string;
  username: string;
  name: string;
  bio: string;
  image: string;
  path: string;
}

export async function updateUser({
  userId,
  username,
  name,
  bio,
  image,
  path,
}: Params): Promise<void> {
  try {
    connectToDB();
    await User.findOneAndUpdate(
      { id: userId },
      { username: username.toLowerCase(), name, bio, image, onboarded: true },
      { upsert: true }
    );

    if (path === "/profile/edit") {
      revalidatePath(path);
    }
  } catch (error: any) {
    throw new Error(`Failed to create/update user: ${error.message}`);
  }
}

export async function fetchUser({ userId }: { userId: string }) {
  try {
    connectToDB();
    return await User.findOne({ id: userId });
  } catch (error: any) {
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
}

export async function fetchUserPosts({ userId }: { userId: string }) {
  try {
    connectToDB();

    const threads = await User.findOne({ id: userId }).populate({
      path: "threads",
      model: Thread,
      populate: {
        path: "children",
        model: Thread,
        populate: { path: "author", model: User, select: "name image id" },
      },
    });

    return threads;
  } catch (error: any) {
    throw new Error(`Failed to fetch user posts: ${error.message}`);
  }
}

/**
 * Recupera una lista de usuarios que coinciden con los criterios especificados.
 * Esta función obtiene datos de usuarios de una base de datos MongoDB usando Mongoose.
 *
 * @param {object} options - Opciones para la recuperación de usuarios.
 * @param {string} options.userId - El ID del usuario actual, excluido de la lista.
 * @param {string} [options.searchString=""] - Cadena de búsqueda para filtrar usuarios por nombre de usuario o nombre.
 * @param {number} [options.pageNumber=1] - El número de página que se va a recuperar.
 * @param {number} [options.pageSize=20] - El número de usuarios que se van a recuperar por página.
 * @param {SortOrder} [options.sortBy="desc"] - El orden en que se deben ordenar los usuarios (ascendente o descendente).
 * @throws {Error} Si ocurre un error al recuperar los usuarios.
 */
export async function fetchUsers({
  userId,
  searchString = "",
  pageNumber = 1,
  pageSize = 20,
  sortBy = "desc",
}: {
  userId: string;
  searchString?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: SortOrder;
}) {
  try {
    // Establece una conexión a la base de datos
    connectToDB();

    // Calcula la cantidad de usuarios a omitir
    const skipAmount = (pageNumber - 1) * pageSize;

    // Crea una expresión regular para la búsqueda insensible a mayúsculas/minúsculas
    const regex = new RegExp(searchString, "i");

    // Construye la consulta para filtrar usuarios
    const query: FilterQuery<typeof User> = {
      id: { $ne: userId },
    };

    // Agrega condiciones de búsqueda si hay una cadena de búsqueda
    if (searchString.trim() !== "") {
      query.$or = [
        { username: { $regex: regex } },
        { name: { $regex: regex } },
      ];
    }

    // Define opciones de ordenamiento
    const sortOptions = { createdAt: sortBy };

    // Crea una consulta para recuperar usuarios con filtros y opciones
    const usersQuery = User.find(query)
      .sort(sortOptions)
      .skip(skipAmount)
      .limit(pageSize);

    // Cuenta el número total de usuarios para la paginación
    const totalUsersCount = await User.countDocuments(query);

    // Ejecuta la consulta de usuarios para recuperar datos
    const users = await usersQuery.exec();

    // Verifica si hay más usuarios disponibles para la próxima página
    const isNext = totalUsersCount > skipAmount + users.length;

    // Devuelve la lista de usuarios y la información de paginación
    return { users, isNext };
  } catch (error: any) {
    throw new Error(`Error al recuperar usuarios: ${error.message}`);
  }
}

/**
 * Recupera la actividad reciente relacionada con un usuario.
 * Esta función obtiene threads secundarios y respuestas de una base de datos MongoDB usando Mongoose.
 *
 * @param {object} options - Opciones para la recuperación de actividad.
 * @param {string} options.userId - El ID del usuario cuya actividad se va a recuperar.
 * @throws {Error} Si ocurre un error al recuperar la actividad.
 */
export async function getActivity({ userId }: { userId: string }) {
  try {
    // Establece una conexión a la base de datos
    connectToDB(); // Se asume que esta función establece la conexión a la base de datos

    // Recupera threads del usuario
    const userThreads = await Thread.find({ author: userId });

    // Extrae IDs de threads secundarios de los threads del usuario
    const childThreadIds = userThreads.flatMap((thread) => thread.children);

    // Recupera respuestas usando los IDs de los threads secundarios
    const replies = await Thread.find({
      _id: { $in: childThreadIds },
      author: { $ne: userId },
    }).populate({ path: "author", model: User, select: "name image _id" });

    return replies;
  } catch (error: any) {
    throw new Error(`Error al recuperar la actividad: ${error.message}`);
  }
}
