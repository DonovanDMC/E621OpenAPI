interface E621ngCompareMetadata {
    behindBy: number | null;
    compareUrl: string;
}

interface E621ngCompareCacheEntry extends E621ngCompareMetadata {
    expiresAt: number;
}

const E621NG_COMPARE_CACHE_KEY_PREFIX = "e621ng-compare:";
const E621NG_COMPARE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function getBadgeColor(behindBy: number | null): string {
    if (behindBy === null) {
        return "#7f8c8d";
    }

    if (behindBy === 0) {
        return "#2ecc71";
    }

    return behindBy < 10 ? "#f1c40f" : "#e67e22";
}

function getBadgeText(commit: string | undefined, behindBy: number | null): string {
    if (behindBy === null) {
        return `e621ng master lag unknown${commit ? ` | ${commit.slice(0, 7)}` : ""}`;
    }

    if (behindBy === 0) {
        return `e621ng master up to date${commit ? ` | ${commit.slice(0, 7)}` : ""}`;
    }

    return `e621ng master ${behindBy} commit${behindBy === 1 ? "" : "s"} behind | ${commit?.slice(0, 7) ?? "unknown"}`;
}

function getE621ngCompareCacheKey(commit: string): string {
    return `${E621NG_COMPARE_CACHE_KEY_PREFIX}${commit}`;
}

function cleanupCachedE621ngCompareMetadata(currentCommit: string): void {
    try {
        for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(E621NG_COMPARE_CACHE_KEY_PREFIX)) {
                continue;
            }

            if (key !== getE621ngCompareCacheKey(currentCommit)) {
                localStorage.removeItem(key);
                continue;
            }

            const cachedValue = localStorage.getItem(key);
            if (!cachedValue) {
                continue;
            }

            const cachedEntry = JSON.parse(cachedValue) as Partial<E621ngCompareCacheEntry>;
            if (
                typeof cachedEntry.expiresAt !== "number"
                || cachedEntry.expiresAt <= Date.now()
                || (cachedEntry.behindBy !== null && typeof cachedEntry.behindBy !== "number")
                || typeof cachedEntry.compareUrl !== "string"
            ) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // Ignore storage failures and continue with uncached behavior.
    }
}

function readCachedE621ngCompareMetadata(commit: string): E621ngCompareMetadata | null {
    try {
        const cachedValue = localStorage.getItem(getE621ngCompareCacheKey(commit));

        if (!cachedValue) {
            return null;
        }

        const cachedEntry = JSON.parse(cachedValue) as Partial<E621ngCompareCacheEntry>;
        if (
            typeof cachedEntry.expiresAt !== "number"
            || cachedEntry.expiresAt <= Date.now()
            || (cachedEntry.behindBy !== null && typeof cachedEntry.behindBy !== "number")
            || typeof cachedEntry.compareUrl !== "string"
        ) {
            localStorage.removeItem(getE621ngCompareCacheKey(commit));
            return null;
        }

        return {
            behindBy: cachedEntry.behindBy ?? null,
            compareUrl: cachedEntry.compareUrl,
        };
    } catch {
        return null;
    }
}

function writeCachedE621ngCompareMetadata(commit: string, compareMetadata: E621ngCompareMetadata): void {
    try {
        const cacheEntry: E621ngCompareCacheEntry = {
            behindBy: compareMetadata.behindBy,
            compareUrl: compareMetadata.compareUrl,
            expiresAt: Date.now() + E621NG_COMPARE_CACHE_TTL_MS,
        };

        localStorage.setItem(getE621ngCompareCacheKey(commit), JSON.stringify(cacheEntry));
    } catch {
        // Ignore storage failures and continue with uncached behavior.
    }
}

function fetchLiveE621ngCompareMetadata(commit: string): Promise<E621ngCompareMetadata | null> {
    const compareApiUrl = `https://api.github.com/repos/e621ng/e621ng/compare/${commit}...master`;

    return fetch(compareApiUrl, {
        headers: {
            accept: "application/vnd.github+json",
        },
    }).then((response) => {
        if (!response.ok) {
            return null;
        }

        return response.json() as Promise<{ ahead_by?: unknown; html_url?: unknown }>;
    }).then((compare) => {
        if (!compare) {
            return null;
        }

        return {
            behindBy: typeof compare.ahead_by === "number" ? compare.ahead_by : null,
            compareUrl: typeof compare.html_url === "string" ? compare.html_url : "https://github.com/e621ng/e621ng/commits/master",
        };
    }).then((compareMetadata) => {
        if (compareMetadata) {
            writeCachedE621ngCompareMetadata(commit, compareMetadata);
        }

        return compareMetadata;
    }).catch(() => null);
}

function renderE621ngStatus(): void {
    const container = document.querySelector<HTMLElement>("#e621ng-status");
    if (!container) {
        return;
    }

    // Filled in from the built spec by webpack.config.js
    const { commit, compareUrl = "https://github.com/e621ng/e621ng" } = container.dataset;
    const rawBehindBy = Number.parseInt(container.dataset.behindBy ?? "", 10);
    const initialBehindBy = Number.isNaN(rawBehindBy) ? null : rawBehindBy;

    const banner = document.createElement("div");
    banner.style.cssText = [
        "display:flex",
        "justify-content:center",
        "padding:16px 16px 0",
        "font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
    ].join(";");

    const badge = document.createElement("a");
    badge.href = compareUrl;
    badge.target = "_blank";
    badge.rel = "noreferrer";
    badge.title = "Compare this tracked e621ng commit against current master";
    badge.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "gap:10px",
        "padding:10px 14px",
        "border-radius:999px",
        "background:#1d2b34",
        "border:1px solid #395062",
        "color:#f3f7fb",
        "text-decoration:none",
        "font-size:13px",
        "line-height:1",
    ].join(";");

    const statusDot = document.createElement("span");
    statusDot.style.cssText = [
        "width:10px",
        "height:10px",
        "border-radius:999px",
        `background:${getBadgeColor(initialBehindBy)}`,
    ].join(";");

    const text = document.createElement("span");
    text.textContent = getBadgeText(commit, initialBehindBy);

    badge.append(statusDot, text);
    banner.append(badge);
    container.append(banner);

    if (!commit) {
        return;
    }

    cleanupCachedE621ngCompareMetadata(commit);

    const cachedCompareMetadata = readCachedE621ngCompareMetadata(commit);
    if (cachedCompareMetadata) {
        badge.href = cachedCompareMetadata.compareUrl;
        statusDot.style.background = getBadgeColor(cachedCompareMetadata.behindBy);
        text.textContent = getBadgeText(commit, cachedCompareMetadata.behindBy);
        return;
    }

    void fetchLiveE621ngCompareMetadata(commit).then((compareMetadata) => {
        if (!compareMetadata) {
            return;
        }

        badge.href = compareMetadata.compareUrl;
        statusDot.style.background = getBadgeColor(compareMetadata.behindBy);
        text.textContent = getBadgeText(commit, compareMetadata.behindBy);
    });
}

renderE621ngStatus();
