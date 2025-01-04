import { ConversionLogs, GenerateVideoRequest } from '@mpeg-v/types';
import { Authorization } from '@mpeg-v/utils';
import { AttachmentBuilder } from 'seyfert';
import { Context, File } from 'utils/types.ts';
import { ALLOWED_EXTENSIONS } from 'utils/general.ts';

export function filterFiles(files: File[], ctx: Context): File[] | null {
	const filteredFiles = files.filter((file) => {
		const extension = file.filename.split('.').pop();
		return extension && ALLOWED_EXTENSIONS.includes(extension);
	});

	if (filteredFiles.length === 0) {
		throw new Error(
			'Unsupported file type, must be one of the following types:\n`' +
				ALLOWED_EXTENSIONS.join(', ') + '`',
		);
	} else return filteredFiles;
}

export function formatFileSize(size: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	while (size >= 1024) {
		size /= 1024;
		i++;
	}
	return size.toFixed(2) + ' ' + units[i];
}

export async function generateVideo(
	file: File,
	ctx: Context,
	type: ConversionLogs['type'],
	sizeLimit: number,
): Promise<[AttachmentBuilder | null, Response]> {
	const extension = file.filename.split('.').pop()!;
	const data: GenerateVideoRequest = {
		url: file.url,
		logs: {
			user_id: ctx.author.id,
			guild_id: ctx.guildId ?? null,
			date_created: ctx.interaction.createdAt,
			type,
			audio_format: extension,
			file_name: file.filename,
		},
		limit: sizeLimit,
	};
	const res = await fetch(Deno.env.get('STREAM') + '/generate', {
		headers: {
			'Content-Type': 'application/json',
			Authorization,
		},
		method: 'POST',
		body: JSON.stringify(data),
	});

	if (res.ok) {
		const attachment = new AttachmentBuilder({
			type: 'buffer',
			resolvable: res.body,
			filename: file.id + '.mp4',
		});

		return [attachment, res];
	} else {
		return [null, res];
	}
}
