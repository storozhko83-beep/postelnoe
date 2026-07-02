/**
 * Cloudflare Pages Function — /product/:slug
 * 
 * Перехоплює запити на /product/<slug>, підтягує дані товару з Convex,
 * підставляє правильні <title>, <meta>, og:image та JSON-LD —
 * Google і соцмережі бачать унікальну сторінку для кожного товару.
 *
 * Файл: functions/product/[slug].js
 */

const CONVEX_API = 'https://cool-wolf-666.eu-west-1.convex.site';
const SITE_URL  = 'https://somniumua.com';

// Українська транслітерація → slug
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

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export async function onRequest(context) {
  const slug = context.params.slug;

  // Fetch products from Convex
  let products = [];
  try {
    const res = await fetch(CONVEX_API + '/products', { cf: { cacheTtl: 300 } });
    const data = await res.json();
    products = data.products || [];
  } catch (e) {
    // Fallback: serve base page
    return context.env.ASSETS.fetch(context.request);
  }

  // Find product by slug
  const product = products.find(p => toSlug(p.name) === slug);

  if (!product) {
    // Product not found — redirect to homepage
    return Response.redirect(SITE_URL + '/', 302);
  }

  // Fetch base index.html from Pages assets
  const baseUrl = new URL('/', context.request.url);
  const htmlRes = await context.env.ASSETS.fetch(baseUrl.toString());
  let html = await htmlRes.text();

  // Prepare SEO data
  const title = `${product.name} — Постільна білизна | Купити Somnium`;
  const desc = product.desc
    ? product.desc.slice(0, 160)
    : `Купити ${product.name} від Somnium. ${product.collection}. Натуральна бавовна 100%. Доставка по Україні.`;
  const image = (product.images && product.images[0]) || '';
  const url = `${SITE_URL}/product/${slug}`;
  const price = product.price || 0;
  const highPrice = product.sizePrices && product.sizePrices.length
    ? Math.max(...product.sizePrices.map(s => s.price || 0))
    : price;

  // Product JSON-LD
  const productLD = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.desc || '',
    "image": product.images || [],
    "url": url,
    "brand": { "@type": "Brand", "name": "Somnium" },
    "material": (product.materials || []).join(', '),
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "UAH",
      "lowPrice": price,
      "highPrice": highPrice,
      "offerCount": (product.sizes || []).length || 1,
      "availability": "https://schema.org/InStock",
      "url": url
    }
  });

  // BreadcrumbList for product page
  const breadcrumbLD = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Головна", "item": SITE_URL + "/" },
      { "@type": "ListItem", "position": 2, "name": "Каталог", "item": SITE_URL + "/#catalog" },
      { "@type": "ListItem", "position": 3, "name": product.name, "item": url }
    ]
  });

  // Replace <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`);

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escHtml(desc)}">`
  );

  // Replace canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${escHtml(url)}">`
  );

  // Replace OG tags
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escHtml(title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escHtml(desc)}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escHtml(url)}">`);
  if (image) {
    html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escHtml(image)}">`);
  }

  // Replace Twitter tags
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escHtml(title)}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escHtml(desc)}">`);
  if (image) {
    html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${escHtml(image)}">`);
  }

  // Inject Product JSON-LD before </head>
  const ldBlock = `<script type="application/ld+json">${productLD}</script>\n<script type="application/ld+json">${breadcrumbLD}</script>\n`;
  html = html.replace('</head>', ldBlock + '</head>');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
