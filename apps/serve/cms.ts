const Authorization = `Bearer ${Deno.env.get("API_TOKEN")}`;

type Items = "conversion_logs";
export function createItem<T>(item: Items, items: object | T) {
  fetch(Deno.env.get("API") + "/items/" + item, {
    method: "post",
    headers: {
      Authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(items),
  }).catch((e) => console.error(`Create ${item} Error:`, e));
}
