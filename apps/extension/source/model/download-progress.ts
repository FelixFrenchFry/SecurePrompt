import type { ModelEvent } from './protocol';

type ModelLoading = Extract<ModelEvent, { type: 'loading' }>;

export type DownloadProgress = { loaded: number; total: number; percent: number };

// the model's file downloads as one, summed over files, never moving backwards; expectedBytes is the
// size of all files, as they start one after another and the small tokenizer would otherwise fill the bar
export const createDownloadProgress = (expectedBytes = 0) =>
{
    const files = new Map<string, { loaded: number; total: number }>();
    let percent = 0;

    return (update: ModelLoading): DownloadProgress | undefined =>
    {
        if (update.status !== 'progress' || update.file == null || update.loaded == null || update.total == null || update.total <= 0)
        {
            return undefined;
        }

        files.set(update.file, { loaded: update.loaded, total: update.total });

        const sizes = [...files.values()];
        const loaded = sizes.reduce((sum, size) => sum + size.loaded, 0);
        const total = Math.max(expectedBytes, sizes.reduce((sum, size) => sum + size.total, 0));

        // a file starting later adds to the total
        percent = Math.max(percent, Math.min(100, (loaded / total) * 100));

        return { loaded, total, percent };
    };
};
