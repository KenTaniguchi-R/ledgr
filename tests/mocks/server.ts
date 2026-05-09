import { setupServer } from "msw/node";
import { allHandlers } from "./handlers";

export const server = setupServer(...allHandlers);
