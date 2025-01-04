import { CommandContext, Embed, MenuCommandContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/index.js';
import { ColorResolvable } from 'seyfert/lib/common/types/resolvables.js';

export const COLORS: { [key: string]: ColorResolvable } = {
	success: '#80ed99',
	error: '#ef4444',
	info: '#00b4d8',
	default: '#ffffff',
};

export const embed = ({
	title,
	message,
	status = 'info',
	color,
}: {
	title?: string;
	message: string;
	status?: 'success' | 'error' | 'info';
	color?: `#${string}`;
}): Embed => {
	return new Embed().setColor(color || COLORS[status || 'default']).setDescription(message)
		.setTitle(title);
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
