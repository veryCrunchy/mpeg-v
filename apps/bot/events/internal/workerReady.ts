import { createEvent } from 'seyfert';

export default createEvent({
	data: { name: 'workerReady' },
	async run(user, client, workerId) {
		client.logger.info(`All shards of ${user.username} are ready`);

		const difference = (Date.now() - Number(Deno.env.get('START_TIME'))) /
			1000;
		client.logger.info(
			`Took ${difference} seconds to start worker ${workerId}, with ${client.workerData.shards.length} shards`,
		);
	},
});
