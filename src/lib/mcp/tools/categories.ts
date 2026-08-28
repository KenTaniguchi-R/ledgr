import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getCategories } from "@/queries/categories";
import { updateTransactionCategoryScoped } from "@/actions/transactions";
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS } from "../constants";
import { JSON_RESULT_SCHEMA, jsonResult } from "../tool-result";

export function registerCategoryReadTools(server: McpServer, householdId: string) {
  server.registerTool(
    "list_categories",
    {
      title: "List Categories",
      description: "List all category groups and their categories for the household.",
      inputSchema: z.object({}),
      outputSchema: JSON_RESULT_SCHEMA,
      annotations: READ_ANNOTATIONS,
    },
    async () => {
      const groups = getCategories(householdId);
      return jsonResult(groups);
    },
  );
}

export function registerCategoryWriteTools(server: McpServer, householdId: string) {
  server.registerTool(
    "update_transaction_category",
    {
      title: "Update Transaction Category",
      description:
        "Set or clear the category for a transaction. Pass null to uncategorize the transaction.",
      inputSchema: z.object({
        transactionId: z.string().min(1).describe("The transaction ID to update"),
        categoryId: z
          .string()
          .nullable()
          .describe("The category ID to assign, or null to uncategorize"),
      }),
      outputSchema: JSON_RESULT_SCHEMA,
      annotations: WRITE_ANNOTATIONS,
    },
    async (args) => {
      const result = await updateTransactionCategoryScoped(householdId, args.transactionId, args.categoryId);
      return jsonResult(result);
    },
  );
}
