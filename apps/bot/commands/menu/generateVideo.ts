import {
	ContextMenuCommand,
	Declare,
	MenuCommandContext,
	MessageCommandInteraction,
} from 'seyfert';
import { embed, handleError } from 'utils/embed.ts';
import { ApplicationCommandType } from 'seyfert/lib/types/index.js';
import { filterFiles, generateVideo } from 'utils/videoUtils.ts';

@Declare({
	name: 'Generate Video',
	integrationTypes: ['GuildInstall', 'UserInstall'],
	type: ApplicationCommandType.Message,
})
export default class GenerateVideo extends ContextMenuCommand {
	override async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
		const files = ctx.target.attachments;
		await ctx.deferReply();

		if (files.length === 0) {
			throw new Error(
				'No files were found in this message, please attach a file to generate a video.',
			);
		}

		const filteredFiles = filterFiles(files, ctx);
		if (!filteredFiles) return;

		for (const file of filteredFiles) {
			const [attachment, res] = await generateVideo(file, ctx, 'menu');

			if (!res.ok) throw new Error('Failed to generate video');

			const conversionTime = res.headers.get('Conversion-Time');
			return ctx.editOrReply({
				content: `-# Completed in ${Number(conversionTime) / 1000} seconds`,
				embeds: [
					embed({
						message: 'Video generated successfully',
						status: 'success',
					}),
				],
				files: [attachment],
			});
		}
	}

	override async onRunError(ctx: MenuCommandContext<any, never>, error: unknown) {
		return handleError(ctx, error);
	}
}
