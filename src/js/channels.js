/*
 * Free live channels for the Live TV screen (js/livetv.js).
 *
 * Every stream here is free and published by the broadcaster itself or by its own free,
 * ad-supported (FAST) distribution: no logins, no subscriptions, no re-streams of paid
 * channels. They were found through the iptv-org database (github.com/iptv-org/iptv) and each
 * one was checked to load in November 2026. Free streams move without notice, so expect the
 * odd one to stop working; a channel that fails shows "Not available right now" and the rest
 * carry on. Remove or add entries here, or point LAUNCHER_CONFIG.liveTv.playlists at an M3U
 * file for more (see js/config.js).
 *
 * Entries: [name, group, url]. Groups appear as tabs in the order they first occur.
 * Some streams are only offered in their home region and may refuse other countries.
 */
window.FREE_CHANNELS = [
    // ---------- News (US)
    ['NBC News NOW', 'News', 'https://d1si3n1st4nkgb.cloudfront.net/10502/88896001/hls/master.m3u8?ads.xumo_channelId=88896001'],
    ['LiveNOW from FOX', 'News', 'https://aka-live1050.delivery.roku.com/eaf7d889-16e0-4c14-a299-a2932df9f467/t2-origin/out/v1/live.m3u8'],
    ['Scripps News', 'News', 'https://aka-live1050.delivery.roku.com/a48b72c9-5755-4ede-9dac-9e51e4ca5cc8/t2-origin/out/v1/live.m3u8'],
    ['Reuters TV', 'News', 'https://amg00453-reuters-amg00453c1-rakuten-uk-2110.playouts.now.amagi.tv/playlist/amg00453-reuters-reuters-rakutenuk/playlist.m3u8'],
    ['USA TODAY', 'News', 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg00731-gannettcoinc-usatodaynews-plex/playlist.m3u8'],
    ['CNN Originals', 'News', 'https://amg01918-cnnus-amg01918c2-vizio-us-9192.playouts.now.amagi.tv/playlist/amg01918-cnnus-cnnoriginals-vizious/playlist.m3u8'],
    ['Cheddar News', 'News', 'https://hls.livecdn.io/cheddar.com/cheddar/playlist.m3u8'],
    ['Newsmax', 'News', 'https://nmx1ota.akamaized.net/hls/live/2107010/Live_1/index.m3u8'],
    ['Bloomberg Originals', 'News', 'https://bloomberg.com/media-manifest/streams/qt.m3u8'],
    ['Yahoo Finance', 'News', 'https://d1ewctnvcwvvvu.cloudfront.net/playlist.m3u8'],

    // ---------- World (English)
    ['Al Jazeera English', 'World', 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8'],
    ['France 24 English', 'World', 'https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8'],
    ['DW News', 'World', 'https://amg01644-amg01644c1-amgplt0343.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg01644-amg01644c1-amgplt0343/playlist.m3u8'],
    ['NHK World-Japan', 'World', 'https://media-tyo.hls.nhkworld.jp/hls/w/live/master.m3u8'],
    ['CNA Originals', 'World', 'https://amg01082-cna-amg01082c1-rlaxx-us-11304.playouts.now.amagi.tv/playlist.m3u8'],

    // ---------- Weather
    ['The Weather Channel', 'Weather', 'https://twcprod-live.twc-tv.com/v1/manifest/b4d4d63a49309cc5140171fb2e92485c31be1e9e/DSP_6228e4760505741a116f1ba2_twcprod-live/6bf09ce5-366b-463c-b67e-c4b799f73c3f/4.m3u8'],
    ['Fox Weather', 'Weather', 'https://aka-live1050.delivery.roku.com/2ff50939-341e-4fa8-becf-718769322f14/t2-origin/out/v1/live.m3u8'],
    ['AccuWeather NOW', 'Weather', 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg00684-accuweather-accuweather-plex/playlist.m3u8'],
    ['WeatherNation', 'Weather', 'https://d2ferbiwcx1539.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-8zd06wicndthf-ssai-prd/WNNationalSamsung/WNNationalSamsung.m3u8'],

    // ---------- Sports
    ['NBC Sports NOW', 'Sports', 'https://d4whmvwm0rdvi.cloudfront.net/10007/99993008/hls/master.m3u8?ads.xumo_channelId=99993008'],
    ['CBS Sports Golazo', 'Sports', 'https://dai.google.com/linear/hls/event/7f3Wv6f7QEKfQna22jHqLQ/master.m3u8'],
    ['NHL Network', 'Sports', 'https://nhl-firetv.amagi.tv/playlist.m3u8'],
    ['PGA Tour', 'Sports', 'https://d11k1mnrgfposz.cloudfront.net/playlist.m3u8'],
    ['Red Bull TV', 'Sports', 'https://0b73ace69ebb45eaa249bb87837cb958.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-644-WORBUSENFAST-LG_US/644/lgtv/hls/master/playlist.m3u8'],
    ['beIN SPORTS XTRA', 'Sports', 'https://bein-xtra-bein.amagi.tv/playlist.m3u8'],
    ['Fubo Sports Network', 'Sports', 'https://dnf08l6u6uxnz.cloudfront.net/master.m3u8'],
    ['SportsGrid', 'Sports', 'https://sportsgrid-tribal.amagi.tv/playlist.m3u8'],
    ['Willow Sports', 'Sports', 'https://d36r8jifhgsk5j.cloudfront.net/Willow_TV.m3u8'],

    // ---------- Kids
    ['PBS Kids', 'Kids', 'https://livestream.pbskids.org/out/v1/14507d931bbe48a69287e4850e53443c/est.m3u8'],
    ['PBS Kids Pacific', 'Kids', 'https://livestream.pbskids.org/out/v1/11f2e6b73eaa4887b3746cb863960e79/pst.m3u8'],
    ['Dove Channel', 'Kids', 'https://linear-896.frequency.stream/dist/cineverse/896/hls/master/playlist.m3u8'],

    // ---------- Entertainment, documentary, lifestyle
    ['PBS Nature', 'Entertainment', 'https://d3mr43kyql7wgk.cloudfront.net/PBS_Nature.m3u8'],
    ['PBS Travel', 'Entertainment', 'https://d3hqevbyoxtkoi.cloudfront.net/PBS_Travel.m3u8'],
    ['PBS Antiques Roadshow', 'Entertainment', 'https://amg00953-pbsusa-antiroadshow-xumo-x6ud5.amagi.tv/playlist.m3u8'],
    ['NBC Comedy Vault', 'Entertainment', 'https://xumo-xumoent-vc-105-z0vpm.fast.nbcuni.com/live/master.m3u8'],
    ['Court TV', 'Entertainment', 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01438-ewscrippscompan-courttv-tablo/playlist.m3u8'],
    ['Tastemade', 'Entertainment', 'https://rakutenaa-tm-intl-aus-rakuten-eu-n1gtg.amagi.tv/playlist/rakutenAA-tm-intl-aus-rakuten-eu/playlist.m3u8'],
    ['Tastemade Travel', 'Entertainment', 'https://d6ef3usc6d9cl.cloudfront.net/Tastemade_Travel.m3u8'],

    // ---------- France (en français)
    ['France 24', 'France', 'https://live.france24.com/hls/live/2037179/F24_FR_HI_HLS/master_5000.m3u8'],
    ['Euronews', 'France', 'https://2f6c5bf4.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmxheHhUVi1ldV9FdXJvbmV3c0ZyYW5jYWlzX0hMUw/playlist.m3u8'],
    ['BFM2', 'France', 'https://d1ib1gsg71oarf.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-scp7wda722jph/BFM2_FR.m3u8'],
    ['Le Figaro TV', 'France', 'https://figarotv-live.freecaster.com/live/freecaster/figarotv.m3u8'],
    ['20 Minutes TV', 'France', 'https://live-20minutestv.digiteka.com/1961167769/index.m3u8'],
    ['RMC Découverte', 'France', 'https://d16zzycxcd0m0r.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-hixvx5kymecr9/RMC_Decouverte_FR.m3u8'],
    ['RMC Story', 'France', 'https://d15aro46bnpfm8.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-fqkqiax1078up/RMC_Story_FR.m3u8'],
    ['RMC Life', 'France', 'https://d3dcdjv6dx07iz.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-eaaww2dyp3iih/RMC_Life_FR.m3u8'],
    ['TV5Monde Chefs', 'France', 'https://tvf-tv5ch.otteravision.com/tvf/tv5ch/tv5ch.m3u8'],
    ['TV Monaco', 'France', 'https://production-fast-mcrtv.content.okast.tv/channels/2116dc08-1959-465d-857f-3619daefb66b/b702b2b9-aebd-436c-be69-2118f56f3d86/master.m3u8'],
    ['NatureTime', 'France', 'https://bamusa-naturetime-emea-fra-rakuten.amagi.tv/playlist.m3u8'],
    ['Ciné Western', 'France', 'https://amg00711-zylo-amg00711c8-rakuten-uk-2686.playouts.now.amagi.tv/playlist/amg00711-zylofast-cinewestern-rakutenuk/playlist.m3u8'],
    ['Mr Bean (animé)', 'France', 'https://amg00627-amg00627c31-rakuten-fr-3991.playouts.now.amagi.tv/playlist/amg00627-banijayfast-mrbeanfrcc-rakutenfr/playlist.m3u8'],
    ['FIFA+', 'France', 'https://37b4c228.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWZyX0ZJRkFQbHVzRnJlbmNoX0hMUw/playlist.m3u8'],

    // ---------- Iran (Persian): channels broadcasting from abroad first (news, music, general,
    // films), then IRIB, Iran's state broadcaster. Manoto and GEM are missing on purpose: their
    // only free streams are third-party re-streams, which refuse outside connections anyway.
    // IRIB links go straight to the 720p rendition: Telewebion's master playlist has a malformed
    // version line that browsers' HLS players reject.
    ['Iran International', 'Iran', 'https://hlspackager.akamaized.net/live/DB/IRAN_INTERNATIONAL/HLS/IRAN_INTERNATIONAL.m3u8'],
    ['VOA Persian', 'Iran', 'https://voa-ingest.akamaized.net/hls/live/2033876/tvmc07/playlist.m3u8'],
    ['Mihan TV', 'Iran', 'https://iptv.mihantv.com/mihantv/playlist.m3u8'],
    ['PMC', 'Iran', 'https://pmchls.wns.live/hls/stream.m3u8'],
    ['PMC Royale', 'Iran', 'https://pmcrohls.wns.live/hls/stream.m3u8'],
    ['Avang', 'Iran', 'https://hls.avang.live/hls/stream.m3u8'],
    ['Navahang', 'Iran', 'https://hls.navahang.live/hls/stream.m3u8'],
    ['RJ TV', 'Iran', 'https://rjtvhls.wns.live/hls/stream.m3u8'],
    ['T2 TV', 'Iran', 'https://t2hls.wns.live/hls/stream.m3u8'],
    ['4U TV', 'Iran', 'https://hls.4utv.live/hls/stream.m3u8'],
    ['MBC Persia', 'Iran', 'https://shd-gcp-live.edgenextcdn.net/live/bitmovin-mbc-persia/818ee8e4b592dc497608f066d825bfb4/index.m3u8'],
    ['Pars TV', 'Iran', 'https://parshls.wns.live/hls/stream.m3u8'],
    ['ITN', 'Iran', 'https://itnhls.wns.live/hls/stream.m3u8'],
    ['Omid-e Iran', 'Iran', 'https://oitnhls.wns.live/hls/stream.m3u8'],
    ['Kanal Jadid', 'Iran', 'https://kjhls.wns.live/hls/stream.m3u8'],
    ['Shabakeh 7', 'Iran', 'https://sh7hls.wns.live/hls/stream.m3u8'],
    ['Tin TV', 'Iran', 'https://tulixcdn.akamaized.net/tintv6/tintv/tintv/playlist.m3u8'],
    ['Maah TV', 'Iran', 'https://hls.maahtv.live/hls/stream.m3u8'],
    ['OXIR TV', 'Iran', 'https://hls.oxir.live/hls/stream.m3u8'],
    ['Persiana Iranian', 'Iran', 'https://irhls.persiana.live/hls/stream.m3u8'],
    ['Persiana Series', 'Iran', 'https://onehls.persiana.live/hls/stream.m3u8'],
    ['Persiana Family', 'Iran', 'https://familyhls.persiana.live/hls/stream.m3u8'],
    ['Persiana Comedy', 'Iran', 'https://comedyhls.persiana.live/hls/stream.m3u8'],
    ['Persiana Cinema', 'Iran', 'https://cinehls.persiana.live/hls/stream.m3u8'],
    ['Persiana Plus', 'Iran', 'https://euhls.persiana.live/hls/stream.m3u8'],
    ['Persiana Nostalgia', 'Iran', 'https://noshls.persiana.live/hls/stream.m3u8'],
    ['Persiana Music', 'Iran', 'https://musichls.persiana.live/hls/stream.m3u8'],
    ['Persiana Travel', 'Iran', 'https://ptravelhls.persiana.live/hls/stream.m3u8'],
    ['Persiana Docs', 'Iran', 'https://scihls.persiana.live/hls/stream.m3u8'],
    ['Persiana Junior', 'Iran', 'https://junhls.persiana.live/hls/stream.m3u8'],
    ['AVA Family', 'Iran', 'https://familyhls.avatv.live/hls/stream.m3u8'],
    ['AVA Series', 'Iran', 'https://avaserieshls.wns.live/hls/stream.m3u8'],
    ['Classic TV', 'Iran', 'https://clshls.wns.live/hls/stream.m3u8'],
    ['Cafe Film', 'Iran', 'https://cafefhls.wns.live/hls/stream.m3u8'],
    ['Gold Star', 'Iran', 'https://moviethls.wns.live/hls/stream.m3u8'],
    ['iFilm', 'Iran', 'https://live.presstv.co.uk/hls/ifilmfa.m3u8'],
    ['IRIB 1', 'Iran', 'https://ncdn.telewebion.ir/tv1/live/720p/index.m3u8'],
    ['IRIB 2', 'Iran', 'https://ncdn.telewebion.ir/tv2/live/720p/index.m3u8'],
    ['IRIB 3', 'Iran', 'https://ncdn.telewebion.ir/tv3/live/720p/index.m3u8'],
    ['IRIB Nasim', 'Iran', 'https://ncdn.telewebion.ir/nasim/live/720p/index.m3u8'],
    ['IRIB Omid', 'Iran', 'https://ncdn.telewebion.ir/omid/live/720p/index.m3u8'],
    ['IRIB Varzesh', 'Iran', 'https://ncdn.telewebion.ir/varzesh/live/720p/index.m3u8']
];
