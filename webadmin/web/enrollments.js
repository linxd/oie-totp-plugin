/* Engine String returns are XStream-wrapped JSON text. The host normally
 * unwraps {string: ...}, while direct callers may still receive the envelope. */
export function decodeEnrollments(response) {
    let value = response;
    if (value && typeof value === 'object' && typeof value.string === 'string') {
        value = value.string;
    }
    if (typeof value === 'string') value = JSON.parse(value);
    const users = Array.isArray(value) ? value : value?.users;
    // Never turn an incompatible or corrupt response into an empty enrollment
    // list, or permit resets without the server's current credential generation.
    if (!Array.isArray(users) || users.some((user) => !user
        || !Number.isSafeInteger(user.id) || user.id <= 0
        || typeof user.username !== 'string' || !user.username
        || typeof user.generation !== 'string' || !user.generation)) {
        throw new Error('5f1564ce8fd456de4e8665e0654876846ce8518c521788683002');
    }
    return [...users].sort((a, b) => a.username.localeCompare(b.username));
}

export const initialEnrollmentState = {
    users: [], loading: true, error: null, resettingId: null
};

function loadError(error) {
    if (error?.status === 403) return '60a86ca167097ba174064e246b659a8c8bc17684674396503002';
    if (error?.status === 404 || error?.status === 501) {
        return '6b645f1564ce672a5b8988c5 TOTP MFA 5f1564ce63d24ef63002';
    }
    return error?.message || '52a08f7d6ce8518c5217886859318d253002';
}

// Keep request ordering and action locks outside render-time state: two clicks
// in the same event turn must not open two dialogs or submit two reset requests.
export function createEnrollmentController({ api, confirmDialog, toast, onChange }) {
    const endpoint = '/extensions/totpmfa';
    let state = initialEnrollmentState;
    let alive = true;
    let sequence = 0;
    let mutating = false;
    const update = (patch) => {
        if (!alive) return;
        state = { ...state, ...patch };
        onChange(state);
    };

    async function load() {
        if (!alive || mutating) return;
        const request = ++sequence;
        update({ loading: true });
        try {
            const users = decodeEnrollments(await api.get(`${endpoint}/enrolled`));
            if (alive && request === sequence) update({ users, error: null, loading: false });
        } catch (error) {
            if (alive && request === sequence) {
                update({ users: [], error: loadError(error), loading: false });
            }
        }
    }

    async function reset(user) {
        if (!alive || state.resettingId !== null || !state.users.includes(user)) return;
        update({ resettingId: user.id });
        try {
            const confirmed = await confirmDialog('91cd7f6e4e246b659a8c8bc1',
                `79fb9664 "${user.username}"? 4ed64eec5c0657284e0b6b21767b5f5565f688ab63d0793a91cd65b08bbe7f6e4e246b659a8c8bc13002`,
                { danger: true, okLabel: '91cd7f6e' });
            if (!alive || !confirmed) return;
            // A refresh while confirmation was open may have replaced the row.
            // Require confirmation against that new snapshot before proceeding.
            if (!state.users.includes(user)) {
                toast('6ce8518c521788685df266f465393002 8bf767e5770b5f53524d752862375e7691cd8bd591cd7f6e3002', 'warn');
                return;
            }
            mutating = true;
            ++sequence; // Discard reads begun before the mutation.
            try {
                await api.post(`${endpoint}/reset/${encodeURIComponent(user.id)}?generation=${encodeURIComponent(user.generation)}`);
                if (alive) toast(`5df291cd7f6e "${user.username}".`, 'success');
            } catch (error) {
                if (alive) toast(error?.status === 409
                    ? '6b646ce8518c5df266f465393002 8bf7572891cd7f6e524d67e5770b523765b0540e7684521788683002'
                    : (error?.message || '91cd7f6e59318d253002'), 'error');
            } finally {
                mutating = false;
            }
            // Also refresh after a failed/ambiguous POST so retry uses current
            // enrollment state. A failed refresh remains visible in the panel.
            await load();
        } catch (error) {
            if (alive) toast(error?.message || '91cd7f6e59318d253002', 'error');
        } finally {
            update({ resettingId: null });
        }
    }

    return { load, reset, dispose() { alive = false; ++sequence; } };
}
