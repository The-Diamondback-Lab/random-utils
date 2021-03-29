const bunyan = require('bunyan');
const axios = require('axios').default;
const fs = require('fs');

let infoLogs = fs.readFileSync('./logs/media-filter.info')
  .toString()
  .split(/\r?\n/gi)
  .filter(s => s.length)
  .map(line => JSON.parse(line))
  .reverse();

let pageOffset = (infoLogs.find(x => x.pageNum != null) || {}).pageNum;

const log = bunyan.createLogger({
  name: 'media-filter',
  level: 'info',
  streams: [
    {
      level: 'info',
      path: './logs/media-filter.info'
    },
    {
      level: 'warn',
      path: './logs/media-filter.warn'
    },
    {
      level: 'error',
      path: './logs/media-filter.error'
    }
  ]
});

(async () => {
  const baseUrl = 'https://dbknews.com/wp-json/wp/v2/media';
  // Limiting 10 results per page because the JSON API server doesn't reliably
  // give 100 results per page when requested (sometimes it gives 80, 99, etc.)
  const defArgs = { per_page: 10 };

  let flaggedItems = [];

  // If pageOffset is not defined, then start at (0+1) because WordPress page
  // indices starts at 1). Otherwise start at (pageOffset+1) to start at the
  // next page.
  let i = (pageOffset || 0) + 1;
  let totalCount = 0;
  while (true) {
    console.time('loop');
    try {
      let response = await axios.get(baseUrl, {
        params: {
          ...defArgs,
          page: i
        }
      });

      // Flag any uncredited media items
      let items = response.data;
      for (let i = 0; i < items.length; i++) {
        let o = items[i];

        if (o.caption == null || o.caption.rendered == null) {
          log.warn({ msg: 'Flagged uncredited media', id: o.id });
          console.log(`Flagged uncredited media ${o.id}`);
          flaggedItems.push({ id: o.id, _links: o._links });
        }
      }

      totalCount += items.length;
      console.log(`Page ${i} completed`);
      log.info({ pageNum: i });
    } catch (err) {
      if (err.code === 'rest_post_invalid_page_number') {
        // Out of bounds page, we're very likely done now
        console.log('Reached the edge of WordPress space :)');
        break;
      }
      log.error({err}, `Page ${i}`);
    }

    i++;

    await timeout(2000);
    console.timeEnd('loop');
  }
})();

function timeout(ms) {
  return new Promise((resolve, _) => {
    setTimeout(resolve, ms);
  });
}
