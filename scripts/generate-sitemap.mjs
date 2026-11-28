import { readFile, writeFile } from "node:fs/promises";

const site = "https://zenof519-ops.github.io/zeno-video/";
const supabaseUrl = "https://pvzucwayxudnnmskkodk.supabase.co";
const supabaseKey = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const testCategoryId = "2ecab84a-fdf4-4122-93cb-299dd93f2921";
const outputPath = new URL("../public/sitemap.xml", import.meta.url);
const escapeXml = value => String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const urls = [{loc:site,lastmod:new Date().toISOString().slice(0,10)},{loc:new URL("contact/",site).toString()}];

try {
  const headers = {apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`};
  const categoryResponse = await fetch(`${supabaseUrl}/rest/v1/video_categories?select=id,is_published,is_hidden&id=eq.${testCategoryId}`,{headers});
  if (!categoryResponse.ok) throw new Error(`Catégories Supabase : HTTP ${categoryResponse.status}`);
  const categories = await categoryResponse.json();
  const category = categories[0];
  if (category?.is_published === true && category?.is_hidden !== true) {
    const videoResponse = await fetch(`${supabaseUrl}/rest/v1/videos?select=id,created_at&category_id=eq.${testCategoryId}&is_published=eq.true&order=created_at.desc`,{headers});
    if (!videoResponse.ok) throw new Error(`Vidéos Supabase : HTTP ${videoResponse.status}`);
    const videos = await videoResponse.json();
    for (const video of videos) urls.push({loc:new URL(`watch.html?id=${encodeURIComponent(video.id)}`,site).toString(),lastmod:video.created_at?new Date(video.created_at).toISOString().slice(0,10):undefined});
  }
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item=>`  <url>\n    <loc>${escapeXml(item.loc)}</loc>${item.lastmod?`\n    <lastmod>${item.lastmod}</lastmod>`:""}\n  </url>`).join("\n")}\n</urlset>\n`;
  await writeFile(outputPath,xml,"utf8");
  console.log(`Sitemap généré : ${urls.length} URL(s), dont ${urls.length-2} vidéo(s) originales publiées.`);
} catch(error) {
  console.warn("Sitemap dynamique non actualisé ; le sitemap existant est conservé :",error.message);
  try { await readFile(outputPath,"utf8"); } catch { throw new Error("Sitemap absent et génération dynamique impossible."); }
}
