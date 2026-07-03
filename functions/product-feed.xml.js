// Cloudflare Pages Function: /product-feed.xml
// Генерує XML-фід товарів для Google Merchant Center у реальному часі,
// беручи актуальні дані прямо з Convex (та ж база, що живить сайт).

const UK = { 'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ye','ж':'zh','з':'z','и':'y','і':'i','ї':'yi','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'yu','я':'ya' };

function seoSlug(name) {
  let r = '';
  for (const ch of String(name || '').toLowerCase()) {
    if (UK[ch] !== undefined) r += UK[ch];
    else if (/[a-z0-9]/.test(ch)) r += ch;
    else if (ch === ' ' || ch === '-') r += '-';
  }
  return r.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function onRequestGet(context) {
  const SITE_URL = 'https://somniumua.com';
  const PRODUCTS_API = 'https://cool-wolf-666.eu-west-1.convex.site/products';

  let products = [];
  try {
    const res = await fetch(PRODUCTS_API);
    const data = await res.json();
    products = Array.isArray(data.products) ? data.products : [];
  } catch (e) {
    return new Response('Failed to load products: ' + e.message, { status: 500 });
  }

  const items = products.map(p => {
    const slug = seoSlug(p.name);
    const link = `${SITE_URL}/product/${slug}`;
    const image = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.image || '');
    const price = Number(p.price || 0).toFixed(2);
    const desc = (p.desc || p.collection || p.name || '').slice(0, 5000);
    if (!image || !price || Number(price) <= 0) return ''; // Google вимагає фото і ціну > 0

    return `
  <item>
    <g:id>${escapeXml(p.id)}</g:id>
    <title>${escapeXml(p.name + (p.collection ? ' — ' + p.collection : ''))}</title>
    <description>${escapeXml(desc)}</description>
    <link>${escapeXml(link)}</link>
    <g:image_link>${escapeXml(image)}</g:image_link>
    <g:availability>in stock</g:availability>
    <g:price>${price} UAH</g:price>
    <g:brand>Somnium</g:brand>
    <g:condition>new</g:condition>
    <g:identifier_exists>no</g:identifier_exists>
    <g:product_type>Постільна білизна</g:product_type>
    <g:google_product_category>Home &amp; Garden &gt; Linens &amp; Bedding &gt; Bedding &gt; Bed Sheets</g:google_product_category>
    <g:shipping>
      <g:country>UA</g:country>
      <g:service>Standard</g:service>
      <g:price>0.00 UAH</g:price>
    </g:shipping>
  </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Somnium — Постільна білизна</title>
  <link>${SITE_URL}</link>
  <description>Каталог постільної білизни Somnium</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
