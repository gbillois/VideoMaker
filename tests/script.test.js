import { describe, expect, it } from "vitest";
import { extractReadmeImages, parseRepoRef } from "../js/videomaker/lib/github.js";
import { briefText, normalizeProject, sceneRange, SCRIPT_SYSTEM, scriptSystem, styleScenes, themeFor, videoPace, videoPurpose, videoStyle, wordTarget } from "../js/videomaker/lib/script.js";
const brief = {
  languages: ["fr-FR", "en-US"],
  duration: 60,
  tone: "",
  audience: "",
  notes: "",
  productName: "CrisisMaker",
  productUrl: "https://crisismaker.example",
  brand: "Wavestone",
  seed: "gbillois/crisismaker"
};
function copy(vo, items = 0) {
  return { vo, eyebrow: "E", title: "Title", subtitle: "Sub", items: Array.from({ length: items }, (_, i) => ({ title: `t${i}`, text: "x", value: "" })), cues: [] };
}
function scene(type, extra = {}, items = 0) {
  return { type, copy: { "fr-FR": copy("Une phrase en fran\xE7ais.", items), "en-US": copy("An English sentence.", items) }, ...extra };
}
describe("Video Maker repository input", () => {
  it.each([
    ["gbillois/CWP", "gbillois", "CWP"],
    ["https://github.com/ahmedkhaleel2004/gitdiagram", "ahmedkhaleel2004", "gitdiagram"],
    ["https://github.com/owner/repo.git", "owner", "repo"],
    ["github.com/owner/repo/tree/main/docs", "owner", "repo"]
  ])("reads %s", (input, owner, repo) => {
    expect(parseRepoRef(input)).toEqual({ owner, repo });
  });
  it("rejects anything that is not a GitHub repository", () => {
    expect(() => parseRepoRef("https://gitlab.com/owner/repo")).toThrow();
    expect(() => parseRepoRef("../../etc/passwd")).toThrow();
  });
  it("keeps product pictures from the README and skips badges and SVGs", () => {
    const images = extractReadmeImages([
      "![build](https://img.shields.io/badge/build-passing-green.svg)",
      "![Dashboard](docs/dashboard.png)",
      '<img src="./assets/logo.svg" alt="logo">',
      '<img alt="Screen" src="https://github.com/o/r/blob/main/shot.jpg">'
    ].join("\n"), "https://raw.githubusercontent.com/o/r/main/");
    expect(images).toEqual([
      { url: "https://raw.githubusercontent.com/o/r/main/docs/dashboard.png", alt: "Dashboard", source: "readme" },
      { url: "https://raw.githubusercontent.com/o/r/main/shot.jpg", alt: "Screen", source: "readme" }
    ]);
  });
});
describe("Video Maker script normalisation", () => {
  it("keeps one shared structure for every language and bounds layouts", () => {
    const project = normalizeProject({
      title: "Film",
      productName: "CrisisMaker",
      scenes: [
        scene("hook", { variant: 7 }),
        scene("screenshot", { image: "img9", focus: { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, points: [{ x: 2, y: -1 }] }, 1),
        scene("features", { icons: ["bolt", "not-an-icon", "shield"] }, 3),
        scene("cta", { variant: 1 })
      ]
    }, brief, ["img1"]);
    expect(project.languages).toEqual(["fr-FR", "en-US"]);
    expect(project.scenes.map((s) => s.type)).toEqual(["hook", "screenshot", "features", "cta"]);
    expect(project.scenes[0].variant).toBe(0);
    expect(project.scenes[1].image).toBe("img1");
    expect(project.scenes[1].focus).toEqual({ x: 0.75, y: 0.75, w: 0.25, h: 0.25 });
    expect(project.scenes[1].points).toEqual([{ x: 1, y: 0 }]);
    expect(project.scenes[2].icons[1]).not.toBe("not-an-icon");
    expect(project.scenes[3].variant).toBe(1);
    expect(project.scenes[2].copy["en-US"]?.items).toHaveLength(3);
    expect(project.theme).toEqual(themeFor("gbillois/crisismaker"));
    expect(project.style).toBe("product");
  });
  it("turns a screenshot scene into a reveal when no picture exists", () => {
    const project = normalizeProject({ scenes: [scene("hook"), scene("screenshot"), scene("features", {}, 3), scene("cta")] }, brief, []);
    expect(project.scenes[1].type).toBe("reveal");
    expect(project.scenes[1].image).toBeNull();
  });
  it("shows an attached picture in the opening hook when the film uses none", () => {
    const scenes = [scene("hook"), scene("problem", {}, 2), scene("features", {}, 3), scene("cta")];
    const project = normalizeProject({ scenes }, { ...brief, purpose: "neutral" }, ["img1", "img2"]);
    expect(project.scenes[0].image).toBe("img1");
    expect(project.scenes[0].variant).toBe(2);
    const shown = normalizeProject({ scenes: [scene("hook"), scene("reveal", { image: "img2" }), scene("features", {}, 3), scene("cta")] }, brief, ["img1", "img2"]);
    expect(shown.scenes[0].image).toBeNull();
    expect(shown.scenes[1].image).toBe("img2");
    expect(normalizeProject({ scenes }, brief, []).scenes[0].variant).toBe(0);
  });
  it("refuses a film missing one of the requested languages", () => {
    const partial = { type: "hook", copy: { "fr-FR": copy("Bonjour.") } };
    expect(() => normalizeProject({ scenes: [partial, partial, partial, partial] }, brief, [])).toThrow(/en-US/);
  });
  it("gives each platform a stable look of its own, always with the Wavestone green accent", () => {
    expect(themeFor("gbillois/a")).toEqual(themeFor("gbillois/a"));
    const looks = new Set(["a", "b", "c", "d", "e", "f", "g"].map((name) => JSON.stringify(themeFor(`gbillois/${name}`))));
    expect(looks.size).toBeGreaterThan(3);
    expect(["a", "b", "c"].map((name) => themeFor(`gbillois/${name}`).accent)).toEqual(["green", "green", "green"]);
  });
  it("passes the author\u2019s key strengths as authoritative instructions", () => {
    const text = briefText({ ...brief, notes: "H\xE9berg\xE9e en Europe" });
    expect(text).toContain("every one of them must appear");
    expect(text).toContain("H\xE9berg\xE9e en Europe");
    expect(text).toContain("fr-FR (French (France)), en-US (American English)");
    expect(text).not.toContain("Marketing ++");
    expect(briefText({ ...brief, marketing: true })).toContain("Marketing ++");
  });
  it("adapts the story, the register and the defaults to the purpose of the film", () => {
    expect(videoPurpose("debrief")).toBe("debrief");
    expect(videoPurpose("anything")).toBe("pitch");
    expect(scriptSystem()).toBe(SCRIPT_SYSTEM);
    expect(SCRIPT_SYSTEM).toContain("marketing films");
    expect(SCRIPT_SYSTEM).not.toContain("Scene types are layouts");
    const debrief = scriptSystem("debrief");
    expect(debrief).toContain("blame-free");
    expect(debrief).toContain("Scene types are layouts");
    expect(debrief).toContain("## Truth");
    expect(debrief).toContain("## Output");
    expect(scriptSystem("project")).toContain("present a project");
    expect(scriptSystem("neutral")).toContain("no marketing spin");
    const neutral = scriptSystem("neutral");
    expect(neutral).toContain("Never leave an attached picture out");
    expect(neutral).not.toContain("product picture");
    expect(neutral).not.toContain("a picture of the product");
    expect(scriptSystem("proposal")).toContain("Never leave an attached picture out");
    expect(videoPurpose("event")).toBe("event");
    const event = scriptSystem("event");
    expect(event).toContain("trade show");
    expect(event).toContain("stand number");
    expect(event).toContain('"team" scene');
    expect(event).toContain("Never leave an attached picture out");
    expect(briefText({ ...brief, audience: "", tone: "", purpose: "event" })).toContain("customers, prospects and partners attending the event");
    expect(videoPace(void 0, "event")).toBe("standard");
    expect(SCRIPT_SYSTEM).not.toContain("Never leave an attached picture out");
    const text = briefText({ ...brief, audience: "", tone: "", marketing: true, purpose: "debrief" });
    expect(text).toContain("the exercise participants and the executive committee");
    expect(text).toContain("factual, constructive, calm");
    expect(text).not.toContain("Marketing ++");
    expect(briefText({ ...brief, marketing: true, purpose: "pitch" })).toContain("Marketing ++");
  });
  it("cuts a product pitch fast by default: more, shorter scenes and fewer words", () => {
    expect(videoPace(void 0, "pitch")).toBe("fast");
    expect(videoPace(void 0, "debrief")).toBe("standard");
    expect(videoPace("standard", "pitch")).toBe("standard");
    expect(sceneRange(60, "fast").min).toBeGreaterThan(sceneRange(60, "standard").max - 1);
    expect(sceneRange(30, "standard")).toEqual({ min: 4, max: 5 });
    expect(sceneRange(30, "fast").min).toBeGreaterThanOrEqual(5);
    expect(sceneRange(120, "fast").max).toBeLessThanOrEqual(14);
    expect(wordTarget(60, "product", "fast")).toBeLessThan(wordTarget(60, "product", "standard"));
    const fast = briefText({ ...brief, purpose: "pitch", duration: 30 });
    expect(fast).toContain("Fast pace");
    expect(fast).toContain(`Scenes: ${sceneRange(30, "fast").min} to ${sceneRange(30, "fast").max}`);
    expect(fast).toContain("3 to 14 words");
    expect(briefText({ ...brief, purpose: "pitch", pace: "standard" })).not.toContain("Fast pace");
    const scenes = [scene("hook"), scene("features", {}, 3), scene("steps", {}, 3), scene("cta")];
    expect(normalizeProject({ scenes }, { ...brief, purpose: "pitch" }, []).pace).toBe("fast");
    expect(normalizeProject({ scenes }, { ...brief, purpose: "project" }, []).pace).toBe("standard");
  });
  it("writes a proposal summary, with the price only when asked", () => {
    expect(videoPurpose("proposal")).toBe("proposal");
    expect(videoPace(void 0, "proposal")).toBe("standard");
    const system = scriptSystem("proposal");
    expect(system).toContain("commercial proposal");
    expect(system).toContain('"team" scene');
    expect(system).toContain("- team:");
    const withPrice = briefText({ ...brief, purpose: "proposal", price: true });
    expect(withPrice).toContain("Price: just before the call to action");
    expect(briefText({ ...brief, purpose: "proposal" })).toContain("leave prices, fees, day rates and budgets out");
    expect(briefText({ ...brief, purpose: "pitch", price: true })).not.toContain("Price:");
    const people = scene("team", {}, 6);
    people.copy["fr-FR"].items[0].title = "Jean-Marc Dupont, associ\xE9 en charge de la relation";
    const project = normalizeProject({ scenes: [scene("hook"), scene("steps", {}, 3), people, scene("cta")] }, { ...brief, purpose: "proposal" }, []);
    const team = project.scenes[2];
    expect(team.type).toBe("team");
    expect(team.icons).toEqual([]);
    expect(team.copy["fr-FR"]?.items).toHaveLength(6);
    expect(team.copy["fr-FR"]?.items[0].title.length).toBeLessThanOrEqual(32);
  });
  it("keeps a planning scene with the period of each phase", () => {
    expect(scriptSystem("proposal")).toContain('"planning" scene');
    expect(scriptSystem("pitch")).toContain("- planning:");
    const plan = scene("planning", { icons: ["clock"] }, 3);
    plan.copy["fr-FR"].items.forEach((item, i) => {
      item.value = `Semaines ${i * 4 + 1} \xE0 ${i * 4 + 4}`;
    });
    const project = normalizeProject({ scenes: [scene("hook"), plan, scene("features", {}, 3), scene("cta")] }, { ...brief, purpose: "proposal" }, []);
    const planning = project.scenes[1];
    expect(planning.type).toBe("planning");
    expect(planning.icons).toEqual([]);
    expect(planning.copy["fr-FR"]?.items.map((item) => item.value)).toEqual(["Semaines 1 \xE0 4", "Semaines 5 \xE0 8", "Semaines 9 \xE0 12"]);
  });
  it("offers each style its own scene types and falls back elsewhere", () => {
    expect(styleScenes("launch")).toContain("- emblem:");
    expect(styleScenes("launch")).toContain("- keys:");
    expect(styleScenes("launch")).not.toContain("- moment:");
    expect(styleScenes("showcase")).toContain("- moment:");
    expect(styleScenes("product")).toContain("- diagram:");
    expect(styleScenes("slides")).toContain("- compare:");
    expect(briefText({ ...brief, style: "launch" })).toContain("- keys:");
    const scenes = [scene("emblem"), scene("keys", {}, 2), scene("diagram", {}, 3), scene("cta")];
    const launch = normalizeProject({ scenes }, { ...brief, style: "launch" }, []);
    expect(launch.scenes.map((s) => s.type)).toEqual(["emblem", "keys", "steps", "cta"]);
    const product = normalizeProject({ scenes }, { ...brief, style: "product" }, []);
    expect(product.scenes.map((s) => s.type)).toEqual(["reveal", "features", "diagram", "cta"]);
    expect(product.scenes[2].icons).toHaveLength(3);
  });
  it("asks for an Apple-style app film in the showcase style", () => {
    expect(videoStyle("showcase")).toBe("showcase");
    const text = briefText({ ...brief, style: "showcase" });
    expect(text).toContain("Showcase style");
    expect(text).not.toContain("Launch style");
    expect(wordTarget(60, "showcase", "standard")).toBe(wordTarget(60, "launch", "standard"));
    const scenes = [scene("hook"), scene("features", {}, 3), scene("steps", {}, 3), scene("cta")];
    expect(normalizeProject({ scenes }, { ...brief, style: "showcase" }, []).style).toBe("showcase");
  });
  it("asks for a short, light script in the launch style", () => {
    expect(briefText(brief)).not.toContain("Launch style");
    const text = briefText({ ...brief, style: "launch" });
    expect(text).toContain("Launch style");
    expect(text).toContain(`about ${wordTarget(brief.duration, "launch")} words`);
    expect(wordTarget(60, "launch")).toBeLessThan(wordTarget(60));
    expect(videoStyle("launch")).toBe("launch");
    expect(videoStyle("slides")).toBe("slides");
    expect(videoStyle("<script>")).toBe("product");
    const scenes = [scene("hook"), scene("features", {}, 3), scene("steps", {}, 3), scene("cta")];
    expect(normalizeProject({ scenes }, { ...brief, style: "launch" }, []).style).toBe("launch");
  });
});
