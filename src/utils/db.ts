import { prisma } from "./prisma";

export async function createDiscordServerMember(
  guildId: string,
  userId: string
) {
  return await prisma.discordServerMember.create({
    data: {
      sid: guildId,
      uid: userId,
    },
  });
}

export async function createDiscordBump(
  memberId: string,
  userId: string,
  serverId: string,
  bumps: number = 1
) {
  console.log(memberId);
  return await prisma.discordBumps.create({
    data: {
      memberId: memberId,
      uid: userId,
      sid: serverId,
      month: new Date().getMonth() + 1,
      bumps: bumps,
    },
  });
}

export async function findDiscordBump(
  userId: string,
  serverId: string,
  month?: number
) {
  return await prisma.discordBumps.findFirst({
    where: {
      uid: userId,
      sid: serverId,
      month: month || new Date().getMonth() + 1,
    },
  });
}
export async function findDiscordServerMember(
  userId: string,
  serverId: string
) {
  return await prisma.discordServerMember.findFirst({
    where: {
      uid: userId,
      sid: serverId,
    },
  });
}
