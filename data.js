const FALLBACK_PUBLIC_DATA = [
  { name:"Wîhkwêntôwin", lat:53.541983, lng:-113.523994, permits:34,  infill:1,   enuPresence:true,  ward:"O-day'min",   councillor:"Anne Stevenson", leader:"", leaderEmail:"", notes:"" },
  { name:"Downtown",     lat:53.539767, lng:-113.499421, permits:126, infill:0,   enuPresence:true,  ward:"O-day'min",   councillor:"Anne Stevenson", leader:"", leaderEmail:"", notes:"" },
  { name:"Strathcona",   lat:53.522390, lng:-113.490986, permits:48,  infill:19,  enuPresence:true,  ward:"papastew",    councillor:"Michael Janz", leader:"", leaderEmail:"", notes:"" },
  { name:"Westmount",    lat:53.549995, lng:-113.539976, permits:41,  infill:37,  enuPresence:false, ward:"O-day'min",   councillor:"Anne Stevenson", leader:"", leaderEmail:"", notes:"" },
  { name:"Garneau",      lat:53.519911, lng:-113.513536, permits:27,  infill:9,   enuPresence:false, ward:"papastew",    councillor:"Michael Janz", leader:"", leaderEmail:"", notes:"" },
  { name:"Glenora",      lat:53.544905, lng:-113.557043, permits:21,  infill:58,  enuPresence:false, ward:"Nakota Isga", councillor:"Reed Clarke", leader:"", leaderEmail:"", notes:"" },
  { name:"Ritchie",      lat:53.513275, lng:-113.482742, permits:22,  infill:32,  enuPresence:true,  ward:"papastew",    councillor:"Michael Janz", leader:"", leaderEmail:"", notes:"" },
  { name:"Highlands",    lat:53.565999, lng:-113.430171, permits:6,   infill:20,  enuPresence:false, ward:"Métis",       councillor:"Ashley Salvador", leader:"", leaderEmail:"", notes:"" },
  { name:"Bonnie Doon",  lat:53.525337, lng:-113.467111, permits:12,  infill:45,  enuPresence:false, ward:"Métis",       councillor:"Ashley Salvador", leader:"", leaderEmail:"", notes:"" },
  { name:"Keswick",      lat:53.417587, lng:-113.632212, permits:20,  infill:710, enuPresence:false, ward:"pihêsiwin",   councillor:"Mike Elliott", leader:"", leaderEmail:"", notes:"" },
  { name:"Windermere",   lat:53.432342, lng:-113.626688, permits:12,  infill:40,  enuPresence:false, ward:"pihêsiwin",   councillor:"Mike Elliott", leader:"", leaderEmail:"", notes:"" },
  { name:"Laurel",       lat:53.445799, lng:-113.381470, permits:11,  infill:10,  enuPresence:false, ward:"Sspomitapi",   councillor:"Jo-Anne Wright", leader:"", leaderEmail:"", notes:"" }
];

// The public site intentionally contains no volunteer, petition, or strategy data.
const FALLBACK_INTERNAL_DATA = [];
