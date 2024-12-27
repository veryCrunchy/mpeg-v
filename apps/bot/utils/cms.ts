const Authorization = `Bearer ${Deno.env.get("API_TOKEN")}`;

type Items = "science_installs";
export function createItem(item: Items, items: object) {
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
