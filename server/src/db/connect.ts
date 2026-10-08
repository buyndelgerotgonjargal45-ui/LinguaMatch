import mongoose from "mongoose";
import { env, isProd } from "../config/env";

let memoryServer: { stop: () => Promise<boolean> } | null = null;

export async function connectDatabase(): Promise<void> {
  let uri = env.MONGODB_URI;

  if (!uri) {
    if (!env.USE_IN_MEMORY_DB || isProd) {
      throw new Error("MONGODB_URI is not set. Set it in .env, or set USE_IN_MEMORY_DB=true for local development.");
    }
    // Imported lazily so production installs don't need the dev dependency.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    uri = server.getUri("linguamatch");
    console.warn("[db] Using an in-memory MongoDB. All data is lost when the server stops.");
  }

  await mongoose.connect(uri);
  console.log("[db] Connected to MongoDB");
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
