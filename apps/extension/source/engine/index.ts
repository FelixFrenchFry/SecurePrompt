import { createOffscreenDetector } from '../model/client';
import { requestModelHost } from '../model/host';
import { createEngine } from './adapter';

// the side panel's engine: the pipeline with the rules and the model in the offscreen page

const engine = createEngine({
    modelDetector: createOffscreenDetector({
        ensureHost: requestModelHost,
        onLoading: (loading) => engine.handleModelLoading(loading),
    }),
});

export const { createPrivatizedPromptAsync } = engine;
export {
    createPrivatizedPromptPreview,
    createPrivatizedPromptWithManualItem,
    LOCAL_MODEL_MISSED_VALUES_PROGRESS_LABEL,
} from './adapter';
export * from './types';
