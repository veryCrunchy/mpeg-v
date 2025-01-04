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

		const guild = await ctx.guild();

		for (const file of filteredFiles) {
			const [attachment, res] = await generateVideo(
				file,
				ctx,
				'menu',
				guild?.premiumTier || 0,
			);

			if (res.status == 413) {
				throw new Error(
					'File size is too large, please try again with a smaller file',
				);
			}
			if (!res.ok || !attachment) throw new Error('Failed to generate video');

			const conversionTime = res.headers.get('Conversion-Time');
			console.log(ctx.interaction);
			return ctx.editOrReply({
				content: `\`${file.filename}\` ${ctx.target.url}\n-# Completed in ${
					Number(conversionTime) / 1000
				} seconds`,
				files: [attachment],
			});
		}
	}

	override onRunError(ctx: MenuCommandContext<any, never>, error: unknown) {
		return handleError(ctx, error);
	}
}
