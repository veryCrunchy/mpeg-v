// @ts-check is better
import { config } from 'seyfert';
export default config.bot({
	token: Deno.env.get('CLIENT_TOKEN') ?? '',
	intents: ['Guilds'],
	debug: !['prod', 'production'].includes(Deno.env.get('ENVIRONMENT')!),
	locations: {
		base: '',
		commands: 'commands',
		events: 'events',
	},
});
