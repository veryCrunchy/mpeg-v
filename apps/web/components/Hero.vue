<template>
  <div class="flex items-center justify-between p-6 bg-discord">
    <div class="max-w-xl space-y-6 my-auto">
      <h1 class="text-4xl font-extrabold text-neutral-100 tracking-tight sm:text-5xl">
        Turn <span class="text-primary">audio</span> to <span class="text-primary">video</span> for phonekind
      </h1>
      <div class="flex gap-x-2">
        <div class="my-auto">
          <div
            class="border-2 border-primary hover:bg-primary/25 rounded-md text-gray-100 p-1.5 pl-3 flex duration-300 sm:w-fit w-full justify-center items-center text-sm font-semibold group whitespace-nowrap gap-x-2">
            Invite to Server
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 fill-gray-100 duration-300 mx-auto"
              viewBox="0 0 16 16">
              <path fill-rule="evenodd"
                d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8">
              </path>
            </svg>
          </div>
        </div>
      </div>
    </div>
    <CardContainer>
      <CardBody class="p-10 h-min w-3/4">
        <CardItem :translate-z="50">
          <img src="/discord_preview.webp" alt="Discord Preview" class="rounded-lg shadow-lg" />
        </CardItem>
      </CardBody>
    </CardContainer>
  </div>
</template>

<script>
export default {
  name: "Hero",
};
</script>
