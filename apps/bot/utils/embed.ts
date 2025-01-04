import { CommandContext, Embed, MenuCommandContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/index.js';
import { ColorResolvable } from 'seyfert/lib/common/types/resolvables.js';

export const COLORS: { [key: string]: ColorResolvable } = {
	success: '#00FF00',
	error: '#FF0000',
	info: '#0000FF',
	custom: '#FFA500',
};

export const embed = ({
	message,
	status = 'info',
	color,
}: {
	message: string;
	status?: 'success' | 'error' | 'info' | 'custom';
	color?: `#${string}`;
}): Embed => {
	return new Embed().setColor(color || COLORS[status]).setDescription(message);
};

export const handleError = (
	ctx: MenuCommandContext<any, never> | CommandContext,
	error: unknown,
) => {
	return ctx.editOrReply({
		embeds: [
			embed({
				message: error instanceof Error
					? `Error: ${error.message}`
					: `Error: ${error}`,
				status: 'error',
			}),
		],
		flags: MessageFlags.Ephemeral,
	});
};
