import type { TableNames, TableSchemas } from "@mpeg-v/types";
export async function createItem<T extends TableNames>(
  item: T,
  items: TableSchemas[T]
): Promise<void> {
  try {
    const Authorization = `Bearer ${Deno.env.get("API_TOKEN")}`;
    const response = await fetch(`${Deno.env.get("API")}/items/${item}`, {
      method: "POST",
      headers: {
        Authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(items),
    });

    if (!response.ok) {
      throw new Error(`Failed to create ${item}: ${response.statusText}`);
    }
  } catch (e) {
    console.error(`Create ${item} Error:`, e);
  }
}
