/**
 * Cloudflare Pages Function — /sitemap.xml
 * 
 * Динамічно генерує sitemap з усіма товарами з Convex.
 * Google бачить 33+ URL замість одного.
 *
 * Файл: functions/sitemap.xml.js
 */

const CONVEX_API = 'https://cool-wolf-666.eu-west-1.convex.site';
const SITE_URL  = 'https://somniumua.com';

const UK = {
  'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ye','ж':'zh',
  'з':'z','и':'y','і':'i','ї':'yi','й':'y','к':'k','л':'l','м':'m','н':'n',
  'о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
  'ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'yu','я':'ya'
};

function toSlug(name) {
  let r = '';
  for (const c of name.toLowerCase()) {
    if (UK[c]) r += UK[c];
    else if (/[a-z0-9]/.test(c)) r += c;
    else if (c === ' ' || c === '-') r += '-';
  }
  return r.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function onRequest(context) {
  let products = [];
  try {
    const res = await fetch(CONVEX_API + '/products', { cf: { cacheTtl: 600 } });
    const data = await res.json();
    products = data.products || [];
  } catch (e) {
    // Fallback: return minimal sitemap
  }

  const today = new Date().toISOString().split('T')[0];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Homepage
  xml += `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

  // Product pages
  for (const p of products) {
    const slug = toSlug(p.name);
    xml += `  <url>\n    <loc>${SITE_URL}/product/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }

  xml += '</urlset>';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
