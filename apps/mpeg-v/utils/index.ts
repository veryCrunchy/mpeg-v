import type { TableNames, TableSchemas } from "@mpeg-v/types";
import { BoostTierFileLimit } from "@mpeg-v/types";
export const Authorization = `Bearer ${Deno.env.get("API_TOKEN")}`;

export async function createItem<T extends TableNames>(
  item: T,
  items: TableSchemas[T],
): Promise<void> {
  try {
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

export async function updateItem<T extends TableNames>(
  item: T,
  id: string,
  fields: Partial<TableSchemas[T]>,
): Promise<void> {
  try {
    const response = await fetch(`${Deno.env.get("API")}/items/${item}/${id}`, {
      method: "PATCH",
      headers: {
        Authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fields),
    });

    if (!response.ok) {
      throw new Error(`Failed to update ${item}/${id}: ${response.statusText}`);
    }
  } catch (e) {
    console.error(`Update ${item} Error:`, e);
  }
}

export const determineSizeLimit = (boostTier: number): number => {
  const tiers = [
    BoostTierFileLimit.Default,
    BoostTierFileLimit.Default,
    BoostTierFileLimit.Tier2,
    BoostTierFileLimit.Tier3,
  ];
  return tiers[boostTier];
};
