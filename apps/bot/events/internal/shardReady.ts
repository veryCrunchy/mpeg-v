import { createEvent } from 'seyfert';

export default createEvent({
	data: { name: 'ready' },
	run(_, client, shardId) {
		client.logger.info(`Shard ${shardId} is ready`);
	},
});
