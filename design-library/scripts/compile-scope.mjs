import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packRoot = path.join(root, "packs", "zelda-mainline");
const catalog = JSON.parse(await readFile(path.join(packRoot, "catalog.json"), "utf8"));

const sha = (value) => createHash("sha256").update(value).digest("hex");
const sourceRecord = ({ sourceId, kind = "official-site", title, url, locator, versionScope = [] }) => ({
  schemaVersion: "1.0.0",
  sourceId,
  tier: "A",
  kind,
  title,
  publisher: "Nintendo",
  authors: [],
  publishedAt: null,
  urlOrArchive: url,
  locator,
  accessedAt: catalog.capturedAt,
  versionScope,
  usePolicy: "paraphrase-and-structured-observation-only",
  rightsNote: "Nintendo source; retain only citation metadata, paraphrase, and structured observations.",
  contentHash: sha(JSON.stringify({ title, url, locator, capturedAt: catalog.capturedAt })),
  status: "verified"
});

const authority = sourceRecord({
  sourceId: catalog.authority.sourceId,
  title: catalog.authority.title,
  url: catalog.authority.url,
  locator: catalog.authority.locator
});

const specialSources = [
  sourceRecord({
    sourceId: "source.nintendo.oracle-pair-2023",
    title: "Oracle of Ages and Oracle of Seasons official retrospective",
    url: "https://www.nintendo.com/jp/topics/article/c4ffd2cf-7151-4a25-914e-8a5aa12a5ee4",
    locator: "Sections distinguishing the two games and linked-play structure",
    versionScope: ["version.oracle-of-ages.original", "version.oracle-of-seasons.original"]
  }),
  sourceRecord({
    sourceId: "source.nintendo.classics-policy-20260717",
    title: "Nintendo Classics feature",
    url: "https://www.nintendo.com/jp/games/feature/nintendo-classics/index.html",
    locator: "Service description and original-content reproduction notice"
  }),
  sourceRecord({
    sourceId: "source.nintendo.ocarina-switch2-announcement-2026",
    title: "Ocarina of Time Nintendo Switch 2 announcement",
    url: "https://www.nintendo.com/jp/topics/article/5101983a-3ed1-4033-841f-c7c80486bfdc",
    locator: "Announcement section identifying platform and 2026 release window",
    versionScope: ["version.ocarina-of-time.switch2-2026"]
  }),
  sourceRecord({ sourceId:"source.nintendo.zelda1.manual", kind:"official-manual", title:"The Legend of Zelda official manual", url:"https://www.nintendo.co.jp/clv/manuals/ja/pdf/CLV-P-HAANJ.pdf", locator:"Manual sections for controls, overworld, items, enemies, and dungeons", versionScope:["version.the-legend-of-zelda.original"] }),
  sourceRecord({ sourceId:"source.nintendo.zelda2.manual", kind:"official-manual", title:"Zelda II official manual", url:"https://www.nintendo.co.jp/clv/manuals/ja/pdf/CLV-P-HAASJ.pdf", locator:"Manual sections for overworld travel, side-view action, towns, magic, lives, and palaces", versionScope:["version.zelda-ii-the-adventure-of-link.original"] }),
  sourceRecord({ sourceId:"source.nintendo.alttp.manual", kind:"official-manual", title:"A Link to the Past official manual", url:"https://www.nintendo.co.jp/clvs/manuals/ja/pdf/CLV-P-VAAEJ.pdf", locator:"Manual sections for controls, world navigation, equipment, and dungeon interaction", versionScope:["version.a-link-to-the-past.original"] }),
  sourceRecord({ sourceId:"source.nintendo.handheld-history.interview", kind:"developer-interview", title:"Iwata Asks — The History of Handheld The Legend of Zelda", url:"https://iwataasks.nintendo.com/interviews/ds/zelda/1/0/", locator:"Volumes covering Link’s Awakening and Capcom-developed handheld games", versionScope:["version.links-awakening.original","version.oracle-of-seasons.original","version.oracle-of-ages.original","version.the-minish-cap.original"] }),
  sourceRecord({ sourceId:"source.nintendo.oot3d.iwata-asks", kind:"developer-interview", title:"Iwata Asks — Ocarina of Time 3D", url:"https://iwataasks.nintendo.com/interviews/3ds/zelda-ocarina-of-time/1/0/", locator:"Original-development recollections separated from Nintendo 3DS remake changes", versionScope:["version.ocarina-of-time.original"] }),
  sourceRecord({ sourceId:"source.nintendo.mm3d.iwata-asks", kind:"developer-interview", title:"Iwata Asks — Majora’s Mask 3D", url:"https://iwataasks.nintendo.com/interviews/3ds/majoras-mask-3d/0/0/", locator:"Original three-day system origin and explicitly separated remake discussion", versionScope:["version.majoras-mask.original"] }),
  sourceRecord({ sourceId:"source.nintendo.four-swords.nso-feature", kind:"official-site", title:"Four Swords official Nintendo Switch Online feature", url:"https://www.nintendo.com/jp/topics/article/8112acf2-75d1-45cc-938c-9b5388e737b4", locator:"Sections on cooperative/competitive structure, player-count maps, and map variation", versionScope:["version.four-swords.original"] }),
  sourceRecord({ sourceId:"source.nintendo.wind-waker-hd.iwata-asks", kind:"developer-interview", title:"Iwata Asks — The Wind Waker HD", url:"https://iwataasks.nintendo.com/interviews/wiiu/wind-waker/0/0/", locator:"Original-development recollections and separately identified HD changes", versionScope:["version.the-wind-waker.original"] }),
  sourceRecord({ sourceId:"source.nintendo.twilight-princess.iwata-asks", kind:"developer-interview", title:"Iwata Asks — Twilight Princess", url:"https://iwataasks.nintendo.com/interviews/wii/twilight_princess/0/0/", locator:"Volumes on original world, player viewpoint, controls, characters, and production", versionScope:["version.twilight-princess.original"] }),
  sourceRecord({ sourceId:"source.nintendo.phantom-hourglass.staff", kind:"developer-interview", title:"Phantom Hourglass official staff interview", url:"https://www.nintendo.co.jp/ds/staff/azej/vol1/index.html", locator:"Volume on stylus control and Nintendo DS design", versionScope:["version.phantom-hourglass.original"] }),
  sourceRecord({ sourceId:"source.nintendo.spirit-tracks.iwata-asks", kind:"developer-interview", title:"Iwata Asks — Spirit Tracks", url:"https://iwataasks.nintendo.com/interviews/ds/zelda/0/0/", locator:"Volumes on rail structure, touch control, characters, and production", versionScope:["version.spirit-tracks.original"] }),
  sourceRecord({ sourceId:"source.nintendo.skyward-sword.iwata-asks", kind:"developer-interview", title:"Iwata Asks — Skyward Sword", url:"https://iwataasks.nintendo.com/interviews/wii/zelda-skyward-sword/0/0/", locator:"Multi-volume interview on MotionPlus, field structure, teaching, story performance, and production", versionScope:["version.skyward-sword.original"] }),
  sourceRecord({ sourceId:"source.nintendo.albw.iwata-asks", kind:"developer-interview", title:"Iwata Asks — A Link Between Worlds", url:"https://iwataasks.nintendo.com/interviews/3ds/a-link-between-worlds/0/0/", locator:"Volumes on perspective, wall-merging, height readability, and non-linear structure", versionScope:["version.a-link-between-worlds.original"] }),
  sourceRecord({ sourceId:"source.nintendo.tri-force-heroes.manual", kind:"official-manual", title:"Tri Force Heroes electronic manual", url:"https://www.nintendo.co.jp/3ds/ea3j/detail/manual_ea3j.pdf", locator:"Sections for single/multiplayer structure, communication icons, controls, and recovery", versionScope:["version.tri-force-heroes.original"] }),
  sourceRecord({ sourceId:"source.nintendo.botw.making-of", kind:"developer-interview", title:"The Making of The Legend of Zelda: Breath of the Wild", url:"https://www.nintendo.com/jp/topics/article/c1fb9037-03c1-11e7-9aaf-063b7ac45a6d", locator:"Official making-of feature on open-air exploration, systems, art, story, and production", versionScope:["version.breath-of-the-wild.original"] }),
  sourceRecord({ sourceId:"source.nintendo.totk.ask-developer", kind:"developer-interview", title:"Ask the Developer Vol. 9, Tears of the Kingdom", url:"https://www.nintendo.com/jp/interview/totk/index.html", locator:"All parts; design intent and implementation context separated from observable game facts", versionScope:["version.tears-of-the-kingdom.original"] }),
  sourceRecord({ sourceId:"source.nintendo.eow.ask-developer", kind:"developer-interview", title:"Ask the Developer Vol. 13, Echoes of Wisdom", url:"https://www.nintendo.com/jp/interview/bdgea/index.html", locator:"All parts; 2D top-down structure, echoes, freedom of solutions, story, and production", versionScope:["version.echoes-of-wisdom.original"] })
];

const dimensions = JSON.parse(await readFile(path.join(root, "taxonomies", "dimensions.json"), "utf8")).terms.map((term) => term.termId);
const allCovered = Object.fromEntries(dimensions.map((id) => [id, "covered"]));

const works = catalog.works.map((entry) => {
  const workId = `work.${entry.slug}`;
  const primaryVersionId = `version.${entry.slug}.original`;
  const versions = [{
    versionId: primaryVersionId,
    relationship: "original",
    researchTreatment: "primary",
    platforms: entry.platforms,
    releaseDate: entry.date,
    deltaFrom: null,
    releaseWindow: null,
    releaseEvents: entry.platforms.map((platform) => ({ region: "JP", date: entry.date, platform, distribution: "unknown" })),
    notes: "Date is the Japanese original catalogue date in the frozen Nintendo Zelda Portal HISTORY snapshot."
  }];
  if (entry.slug === "ocarina-of-time") versions.push({
    versionId: "version.ocarina-of-time.switch2-2026",
    relationship: "review",
    researchTreatment: "review",
    platforms: ["Nintendo Switch 2"],
    releaseDate: null,
    deltaFrom: primaryVersionId,
    releaseWindow: "2026",
    releaseEvents: [{ region: "JP", date: null, platform: "Nintendo Switch 2", distribution: "unknown" }],
    notes: "Officially announced; edition type and exact date remain undisclosed at the 2026-07-17 snapshot."
  });
  if (["breath-of-the-wild", "tears-of-the-kingdom"].includes(entry.slug)) versions.push({
    versionId: `version.${entry.slug}.switch2-edition`,
    relationship: "enhanced-edition",
    researchTreatment: "delta",
    platforms: ["Nintendo Switch 2"],
    releaseDate: "2025-06-05",
    deltaFrom: primaryVersionId,
    releaseWindow: null,
    releaseEvents: [{ region: "JP", date: "2025-06-05", platform: "Nintendo Switch 2", distribution: "physical" }],
    notes: "Enhanced edition under the same work; save continuity and upgrade path do not create a new work."
  });
  return {
    schemaVersion: "1.0.0",
    workId,
    canonicalTitle: entry.title,
    aliases: [],
    scopeDecision: "included",
    inclusionBasis: "Included by the frozen Nintendo Zelda Portal HISTORY work-node rule; Oracle pair is resolved as two content-distinct works.",
    releaseFamily: { primaryVersionId, versions },
    perspectiveTags: entry.perspectives,
    researchStatus: "covered",
    dimensionCoverage: allCovered,
    sourceRefs: [catalog.authority.sourceId, `source.game.${entry.slug}`],
    openQuestions: entry.slug === "ocarina-of-time" ? ["Classify the announced Nintendo Switch 2 edition when Nintendo publishes its edition type."] : [],
    lastReviewedAt: catalog.capturedAt
  };
});

const gameSources = catalog.works.map((entry) => sourceRecord({
  sourceId: `source.game.${entry.slug}`,
  kind: "game",
  title: `${entry.title} — primary game and official product record`,
  url: entry.productUrl,
  locator: "Primary-version observable rules and states; official product page used for title/version context",
  versionScope: [`version.${entry.slug}.original`]
}));

const candidateIds = works.map((work) => work.workId);
const scope = {
  schemaVersion: "1.0.0",
  scopeId: "scope.zelda-mainline",
  scopeVersion: "1.0.0",
  status: "frozen",
  policy: {
    authorityRule: "Include each independent game represented by a work node in the frozen Nintendo Zelda Portal HISTORY; split an officially documented multi-game node into separate works.",
    releaseGroupingRule: "Regional events, concurrent original platforms, ports, and emulated rereleases share the original workId and are recorded as versions or release events.",
    variantRule: "Remasters, remakes, expansions, and enhanced editions receive delta versions under the same workId; an undisclosed edition type remains version-level review.",
    borderlineRule: "Multiplayer entries remain included when present in HISTORY; spin-offs and adjacent product lines outside the authority union are logged as boundary exclusions.",
    changeRule: "A later authority change creates a new semantic scope release and migration; frozen releases are never silently rewritten."
  },
  authoritySnapshots: [{
    snapshotId: "scope-snapshot.nintendo-portal-history-20260717",
    sourceRefs: [catalog.authority.sourceId, "source.nintendo.oracle-pair-2023"],
    capturedAt: catalog.capturedAt,
    contentHash: sha(JSON.stringify({ authority: catalog.authority, works: candidateIds })),
    candidateWorkIds: candidateIds
  }],
  candidates: candidateIds.map((workId) => ({
    workId,
    decision: "included",
    rationale: "Resolved by the frozen HISTORY work-node rule; no candidate remains at work-level review.",
    sourceRefs: workId.includes("oracle-of-") ? [catalog.authority.sourceId, "source.nintendo.oracle-pair-2023"] : [catalog.authority.sourceId]
  })),
  decisions: catalog.versionDecisions.map((decision) => ({
    decisionId: decision.id,
    question: decision.id.replace("scope-decision.", "").replaceAll("-", " "),
    resolution: decision.resolution,
    sourceRefs: decision.id === "scope-decision.oracle-pair" ? ["source.nintendo.oracle-pair-2023"] : decision.id === "scope-decision.ports-remakes" ? ["source.nintendo.classics-policy-20260717"] : decision.id === "scope-decision.ocarina-switch2" ? ["source.nintendo.ocarina-switch2-announcement-2026"] : [catalog.authority.sourceId]
  })),
  reconciliation: {
    authorityUnionCount: candidateIds.length,
    registeredCandidateCount: candidateIds.length,
    missingFromRegistry: [],
    notInAuthorityUnion: [],
    unresolvedReviewCount: 0
  },
  supersedes: null
};

await mkdir(path.join(packRoot, "works"), { recursive: true });
await mkdir(path.join(packRoot, "sources"), { recursive: true });
await writeFile(path.join(packRoot, "corpus-scope.json"), `${JSON.stringify(scope, null, 2)}\n`);
await writeFile(path.join(packRoot, "works", "work-registry.json"), `${JSON.stringify(works, null, 2)}\n`);
await writeFile(path.join(packRoot, "sources", "source-registry.json"), `${JSON.stringify([authority, ...specialSources, ...gameSources], null, 2)}\n`);

console.log(`Compiled scope ${scope.scopeVersion}: ${works.length} works, ${gameSources.length + specialSources.length + 1} sources.`);
