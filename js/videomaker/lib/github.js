/**
 * Video Maker: reads a GitHub repository into bounded marketing material
 * (description, README, file tree, a few product-describing files) and lists
 * the pictures that could show the product on screen.
 *
 * The optional GitHub token travels per request (private repositories) and is
 * never stored: the page is public, so a server-side token would expose every
 * repository it can read.
 */
const README_LIMIT = 40_000;
const FILE_LIMIT = 8_000;
const CONTEXT_FILES_LIMIT = 5;
const TREE_LINES_LIMIT = 300;
const IMAGE_CANDIDATES_LIMIT = 16;
const SKIPPED_TREE_PARTS = /(^|\/)(node_modules|dist|build|vendor|\.git|\.next|coverage|__pycache__|\.venv|target)(\/|$)/;
const SKIPPED_TREE_FILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.min\.(js|css)|\.map)$/i;
const BADGE_HOSTS = /(shields\.io|badge|travis-ci|codecov|circleci|github\.com\/[^/]+\/[^/]+\/(actions\/)?workflows|herokucdn|ko-fi|buymeacoffee|gitter\.im|app\.netlify\.com\/sites)/i;
const PRODUCT_IMAGE_NAME = /(screen|capture|demo|preview|dashboard|hero|banner|logo|ui|app|interface|overview|home|showcase)/i;
const RASTER_IMAGE = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;
// Files that describe the product in words, in order of preference.
const DESCRIPTIVE_FILES = [
    /^package\.json$/i, /^(docs\/)?(overview|features|product|about|intro(duction)?)\.md$/i,
    /^docs\/[^/]+-specs?\.md$/i, /^docs\/index\.md$/i, /^(claude|agents)\.md$/i, /^index\.html$/i,
    /^frontend\/index\.html$/i, /^public\/index\.html$/i,
];
export class RepoAccessError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'RepoAccessError';
    }
}
/** Accepts `owner/repo`, a github.com URL (any sub-path) or a git clone URL. */
export function parseRepoRef(input) {
    const value = String(input || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
    const fromUrl = value.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/i);
    const bare = value.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
    const match = fromUrl || bare;
    if (!match)
        throw new RepoAccessError('Enter a GitHub repository as owner/repo or https://github.com/owner/repo', 400);
    const [, owner, repo] = match;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
        throw new RepoAccessError('Invalid GitHub repository name', 400);
    }
    return { owner, repo };
}
// Called straight from the browser: no User-Agent (forbidden header) and no custom
// header on raw.githubusercontent.com, so a plain request needs no CORS preflight.
function githubHeaders(token, accept = 'application/vnd.github+json') {
    const headers = { Accept: accept };
    if (token)
        headers.Authorization = `Bearer ${token}`;
    return headers;
}
async function githubJson(path, token) {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: githubHeaders(token), signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) {
        throw new RepoAccessError('Repository not found (or private: add a read-only GitHub token)', 404);
    }
    if (response.status === 401)
        throw new RepoAccessError('GitHub token refused', 401);
    if (response.status === 403 || response.status === 429) {
        throw new RepoAccessError('GitHub API limit reached: try again later or add a GitHub token', 429);
    }
    if (!response.ok)
        throw new RepoAccessError(`GitHub answered ${response.status}`, 502);
    return await response.json();
}
async function rawFile(ref, branch, path, token, limit) {
    const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10_000) });
    if (!response.ok)
        return '';
    const text = await response.text();
    return text.slice(0, limit);
}
/** README picture references, resolved against the README's own folder. */
export function extractReadmeImages(markdown, baseRawUrl) {
    const found = [];
    const push = (src, alt) => {
        const cleaned = src.trim().replace(/^<|>$/g, '').split(/\s+/)[0];
        if (!cleaned || cleaned.startsWith('data:') || /\.svg(\?|#|$)/i.test(cleaned))
            return;
        let absolute;
        try {
            absolute = new URL(cleaned, baseRawUrl);
        }
        catch {
            return;
        }
        if (absolute.protocol !== 'https:')
            return;
        if (BADGE_HOSTS.test(absolute.href))
            return;
        // github.com/<owner>/<repo>/blob/<branch>/<path> → raw file
        const blob = absolute.href.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
        const href = blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}` : absolute.href;
        if (found.some(image => image.url === href))
            return;
        found.push({ url: href, alt: alt.trim().slice(0, 120), source: 'readme' });
    };
    for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g))
        push(match[2], match[1]);
    for (const match of markdown.matchAll(/<img\b[^>]*>/gi)) {
        const tag = match[0];
        const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
        const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || '';
        if (src)
            push(src, alt);
    }
    // Reference-style links: ![alt][ref] … [ref]: url
    const references = new Map();
    for (const match of markdown.matchAll(/^\s*\[([^\]]+)\]:\s*(\S+)/gm))
        references.set(match[1].toLowerCase(), match[2]);
    for (const match of markdown.matchAll(/!\[([^\]]*)\]\[([^\]]*)\]/g)) {
        const url = references.get((match[2] || match[1]).toLowerCase());
        if (url)
            push(url, match[1]);
    }
    return found;
}
function treeImages(paths, ref, branch) {
    return paths
        .filter(path => RASTER_IMAGE.test(path) && PRODUCT_IMAGE_NAME.test(path) && !SKIPPED_TREE_PARTS.test(path)
        && !/(favicon|icon-\d|apple-touch|sprite|emoji|avatar)/i.test(path))
        .slice(0, IMAGE_CANDIDATES_LIMIT)
        .map(path => ({
        url: `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`,
        alt: path,
        source: 'tree',
    }));
}
function compactPackageJson(text) {
    try {
        const pkg = JSON.parse(text);
        const picked = {};
        for (const key of ['name', 'description', 'keywords', 'homepage'])
            if (pkg[key])
                picked[key] = pkg[key];
        return JSON.stringify(picked, null, 2);
    }
    catch {
        return text.slice(0, 1_000);
    }
}
function compactHtml(text) {
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
    const description = text.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || '';
    const headings = [...text.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
        .map(match => match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12);
    return [`title: ${title}`, `description: ${description}`, ...headings.map(heading => `heading: ${heading}`)].join('\n');
}
export async function analyzeRepository(input, token) {
    const ref = parseRepoRef(input);
    const cleanToken = token?.trim() || undefined;
    const meta = await githubJson(`/repos/${ref.owner}/${ref.repo}`, cleanToken);
    const branch = meta.default_branch || 'main';
    const [readmeResponse, tree] = await Promise.all([
        fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/readme`, {
            headers: githubHeaders(cleanToken, 'application/vnd.github.raw+json'), signal: AbortSignal.timeout(12_000),
        }).catch(() => null),
        githubJson(`/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, cleanToken).catch(() => ({ tree: [], truncated: true })),
    ]);
    const readme = readmeResponse?.ok ? (await readmeResponse.text()).slice(0, README_LIMIT) : '';
    const readmePath = tree.tree.find(entry => /^readme(\.[a-z]+)?$/i.test(entry.path))?.path || 'README.md';
    const readmeDir = readmePath.includes('/') ? readmePath.slice(0, readmePath.lastIndexOf('/') + 1) : '';
    const files = tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path);
    const listed = files.filter(path => !SKIPPED_TREE_PARTS.test(path) && !SKIPPED_TREE_FILES.test(path));
    const descriptive = [];
    for (const pattern of DESCRIPTIVE_FILES) {
        for (const path of listed) {
            if (descriptive.length >= CONTEXT_FILES_LIMIT)
                break;
            if (pattern.test(path) && !descriptive.includes(path))
                descriptive.push(path);
        }
    }
    const fileTexts = await Promise.all(descriptive.map(async (path) => {
        const text = await rawFile(ref, branch, path, cleanToken, FILE_LIMIT * 4);
        if (!text)
            return '';
        const body = /package\.json$/i.test(path) ? compactPackageJson(text)
            : /\.html$/i.test(path) ? compactHtml(text) : text.slice(0, FILE_LIMIT);
        return `### ${path}\n${body}`;
    }));
    const baseRaw = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${readmeDir}`;
    const images = [...extractReadmeImages(readme, baseRaw), ...treeImages(files, ref, branch)]
        .filter((image, index, all) => all.findIndex(other => other.url === image.url) === index)
        .slice(0, IMAGE_CANDIDATES_LIMIT);
    const context = [
        `Repository: ${meta.full_name} (${meta.html_url})`,
        `Description: ${meta.description || '(none)'}`,
        `Homepage: ${meta.homepage || '(none)'}`,
        `Topics: ${(meta.topics || []).join(', ') || '(none)'}. Primary language: ${meta.language || '(unknown)'}.`,
        '',
        '## README',
        readme || '(no README)',
        '',
        '## Product-describing files',
        fileTexts.filter(Boolean).join('\n\n') || '(none)',
        '',
        `## File tree${tree.truncated || listed.length > TREE_LINES_LIMIT ? ' (excerpt)' : ''}`,
        listed.slice(0, TREE_LINES_LIMIT).join('\n'),
    ].join('\n');
    return {
        owner: ref.owner,
        repo: ref.repo,
        url: meta.html_url,
        name: meta.name,
        description: meta.description || '',
        homepage: meta.homepage || '',
        topics: meta.topics || [],
        language: meta.language || '',
        stars: meta.stargazers_count || 0,
        defaultBranch: branch,
        isPrivate: !!meta.private,
        context,
        images,
    };
}
