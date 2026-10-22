import type { Span } from '@secureprompt/core';
import type { ClassifiedTokens } from '../classifier';

export type LabelSet = {
    // entity types sorted by name as in the original decoder, index types.length means "O"
    types: string[];
    // per label id: index into types (or types.length for O)
    typeOfLabel: Int32Array;
    // per label id: whether it begins an entity (B- or S-)
    beginsEntity: Uint8Array;
};

export const createLabelSet = (id2label: Record<string, string>): LabelSet =>
{
    const labels = Object.entries(id2label)
        .map(([id, label]) => [Number(id), label] as const)
        .sort(([left], [right]) => left - right);
    const types = [...new Set(labels.filter(([, label]) => label !== 'O').map(([, label]) => label.slice(2)))].sort();
    const typeIndex = new Map(types.map((type, index) => [type, index]));
    const typeOfLabel = new Int32Array(labels.length);
    const beginsEntity = new Uint8Array(labels.length);

    for (const [id, label] of labels)
    {
        typeOfLabel[id] = label === 'O' ? types.length : typeIndex.get(label.slice(2))!;
        beginsEntity[id] = label.startsWith('B-') || label.startsWith('S-') ? 1 : 0;
    }

    return { types, typeOfLabel, beginsEntity };
};

// per token: probabilities pooled per entity type (B- plus I-), begin mass and window count
export type TokenEvidence = {
    types: string[];
    offsets: Array<Span | null>;
    // token × (types.length + 1): mean probability per type over the windows, last column "O"
    typeProbabilities: Float32Array;
    // per token: mean probability of a B- or S- label
    beginMass: Float32Array;
    windowCounts: Uint16Array;
};

export const poolEvidence = (tokens: ClassifiedTokens, labels: LabelSet): TokenEvidence =>
{
    const width = labels.types.length + 1;
    const count = tokens.offsets.length;
    const typeProbabilities = new Float32Array(count * width);
    const beginMass = new Float32Array(count);

    tokens.probabilities.forEach((probabilities, token) =>
    {
        for (let label = 0; label < probabilities.length; label += 1)
        {
            typeProbabilities[token * width + labels.typeOfLabel[label]!]! += probabilities[label]!;

            if (labels.beginsEntity[label] === 1)
            {
                beginMass[token]! += probabilities[label]!;
            }
        }
    });

    return { types: labels.types, offsets: tokens.offsets, typeProbabilities, beginMass, windowCounts: tokens.windowCounts };
};
