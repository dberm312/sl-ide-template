// Keep behavior and vocabulary in sync with template scripts/feedback-schema.mjs.
import vocab from './feedback-vocab.json' with { type: 'json' };
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function keys(value, allowed) {
    if (Object.keys(value).some(k => !allowed.includes(k)))
        throw new Error('Unknown field');
}
function member(value, values, field) {
    if (typeof value !== 'string' || !values.includes(value))
        throw new Error(`Invalid ${field}`);
}
function counts(value, allowed) {
    if (!object(value))
        throw new Error('Expected counts');
    keys(value, allowed);
    for (const n of Object.values(value))
        if (!Number.isSafeInteger(n) || Number(n) < 0 || Number(n) > 100000)
            throw new Error('Invalid count');
}
export function checkText(text) {
    if (text !== text.normalize('NFKC'))
        throw new Error('Use plain text without compatibility characters');
    if (text.length > 280 || /[\p{Cc}\p{Cf}]/u.test(text))
        throw new Error('Text exceeds limit or contains hidden characters');
    if (/\p{Nd}{2,}/u.test(text))
        throw new Error('Use size buckets instead of multi-digit numbers');
    if (/["“”‘’`]|(?:^|\s)'|'(?:\s|$)/u.test(text))
        throw new Error('Quoted string');
    // Exact fixed harness paths may appear in prose, but arbitrary paths may not.
    let rest = text;
    for (const path of [...vocab.harnessPaths].sort((a, b) => b.length - a.length))
        rest = rest.replaceAll(path, 'harness');
    if (/(?:https?:|www\.|\b[\w-]+(?:\.[\w-]+)+\b|@)/i.test(rest))
        throw new Error('URL, email or domain');
    if (/[\\/]|\b[\w-]+\.(?:js|jsx|mjs|tsx|ts|md|pdf|csv|json)\b/i.test(rest))
        throw new Error('Non-harness file path');
}
export function validateFeedback(value) {
    if (!object(value))
        throw new Error('Expected report object');
    const base = ['v', 'projectId', 'kind', 'harness', 'agent', 'format'];
    const detail = ['area', 'element', 'size', 'outcome', 'workaround', 'touched', 'skill', 'mechanism', 'suggestion'];
    keys(value, [...base, ...(value.kind === 'ship' ? ['size', 'audit', 'drift', 'added', 'mechanism'] : detail)]);
    if (value.v !== 1)
        throw new Error('Invalid schema version');
    if (typeof value.projectId !== 'string' || !/^fb_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.projectId))
        throw new Error('Invalid projectId');
    if (typeof value.harness !== 'string' || !/^(?:[0-9a-f]{7,12}|unknown)$/.test(value.harness))
        throw new Error('Invalid harness');
    for (const field of ['kind', 'agent', 'format'])
        member(value[field], vocab[field], field);
    if (value.kind !== 'ship') {
        for (const field of ['area', 'element', 'outcome', 'workaround', 'skill'])
            member(value[field], vocab[field], field);
        if (!Array.isArray(value.touched))
            throw new Error('Missing touched');
    }
    else {
        counts(value.audit, vocab.audit);
        if (Object.keys(value.audit).length !== vocab.audit.length)
            throw new Error('Missing audit counts');
        if (!Array.isArray(value.drift) || !object(value.added))
            throw new Error('Missing drift or added');
        keys(value.added, vocab.added);
        for (const group of Object.values(value.added))
            counts(group, vocab.extensions);
        if (!object(value.size) || typeof value.size.pages !== 'string')
            throw new Error('Missing page bucket');
    }
    if (value.size !== undefined) {
        if (!object(value.size))
            throw new Error('Invalid size');
        keys(value.size, value.kind === 'ship' ? ['pages'] : ['rows', 'cols', 'pages']);
        for (const [key, size] of Object.entries(value.size))
            member(size, vocab.size[key], 'size');
    }
    for (const field of ['touched', 'drift']) {
        if (value[field] === undefined)
            continue;
        const paths = value[field];
        if (!Array.isArray(paths) || paths.length > vocab.harnessPaths.length || new Set(paths).size !== paths.length)
            throw new Error('Invalid harness paths');
        for (const path of paths)
            member(path, vocab.harnessPaths, 'harness path');
    }
    for (const field of ['mechanism', 'suggestion']) {
        if (value[field] === undefined)
            continue;
        if (typeof value[field] !== 'string')
            throw new Error('Invalid text');
        checkText(value[field]);
    }
    if (Buffer.byteLength(JSON.stringify(value)) > 8192)
        throw new Error('Report exceeds 8 KB');
    return value;
}
