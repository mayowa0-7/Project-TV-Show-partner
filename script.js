// ===== Global State =====
let currentView = "shows"; // "shows" | "episodes"
let allShows = [];
let allEpisodes = [];
let selectedShowId = null;

// ===== Create UI Elements =====
const rootElem = document.getElementById("root");

const controlsBar = document.createElement("div");
controlsBar.id = "controls-bar";

const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.placeholder = "Search shows...";
searchInput.id = "search-input";

const searchCount = document.createElement("span");
searchCount.id = "search-count";

const episodeSelect = document.createElement("select");
episodeSelect.id = "episode-select";
episodeSelect.style.display = "none";

const backBtn = document.createElement("button");
backBtn.id = "back-to-shows";
backBtn.textContent = "← Back to Shows";
backBtn.style.display = "none";

controlsBar.append(backBtn, searchInput, episodeSelect, searchCount);
document.body.insertBefore(controlsBar, rootElem);

// ===== Single-Fetch Caches =====
let showsListPromise = null;
const episodesCache = new Map();
const inFlightEpisodeFetch = new Map();

// Load episodes when the page loads
window.onload = setup;

function setup() {
  setView("shows");
  showLoadingMessage("Loading shows…");

  fetchShowsOnce()
    .then(shows => {
      shows.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "accent" })
      );
      allShows = shows;
      hideMessage();
      renderShows(allShows);
      updateSearchUI();
    })
    .catch(err => {
      showErrorMessage("Failed to load shows. Please try again later.");
      console.error(err);
    });

  backBtn.addEventListener("click", () => {
    setView("shows");
    episodeSelect.value = "all";
    searchInput.value = "";
    renderShows(allShows);
    updateSearchUI();
  });

  searchInput.addEventListener("input", onSearchInput);

  episodeSelect.addEventListener("change", () => {
    if (currentView !== "episodes") return;
    const selectedId = episodeSelect.value;
    const term = searchInput.value.toLowerCase();
    const base = filterEpisodes(allEpisodes, term);

    if (selectedId === "all") {
      displayEpisodes(base);
      updateSearchCount(base.length, allEpisodes.length);
    } else {
      const selectedEpisode = base.find(ep => ep.id.toString() === selectedId);
      displayEpisodes(selectedEpisode ? [selectedEpisode] : []);
      updateSearchCount(selectedEpisode ? 1 : 0, allEpisodes.length);
    }
  });
}
// ===== View Management =====
function setView(view) {
  currentView = view;
  if (view === "shows") {
    backBtn.style.display = "none";
    episodeSelect.style.display = "none";
    searchInput.placeholder = "Search shows (name, genres, summary)…";
    searchCount.textContent = "";
  } else {
    backBtn.style.display = "inline-block";
    episodeSelect.style.display = "inline-block";
    searchInput.placeholder = "Search episodes (name or summary)…";
  }
}

function onSearchInput() {
  const term = searchInput.value.toLowerCase();
  if (currentView === "shows") {
    const filtered = filterShows(allShows, term);
    renderShows(filtered);
    searchCount.textContent = `Showing ${filtered.length} / ${allShows.length} shows`;
  } else {
    const filtered = filterEpisodes(allEpisodes, term);
    displayEpisodes(filtered);
    updateSearchCount(filtered.length, allEpisodes.length);
    episodeSelect.value = "all";
  }
}

function updateSearchUI() {
  if (currentView === "shows") {
    searchCount.textContent = `Showing ${allShows.length} / ${allShows.length} shows`;
  } else {
    searchCount.textContent = `Showing ${allEpisodes.length} / ${allEpisodes.length} episodes`;
  }
}

// ===== Fetch Helpers =====
function fetchShowsOnce() {
  if (showsListPromise) return showsListPromise;
  showsListPromise = fetch("https://api.tvmaze.com/shows")
    .then(res => {
      if (!res.ok) throw new Error(`Shows HTTP ${res.status}`);
      return res.json();
    });
  return showsListPromise;
}


function fetchEpisodesOnce(showId) {
  if (episodesCache.has(showId)) {
    return Promise.resolve(episodesCache.get(showId));
  }
  if (inFlightEpisodeFetch.has(showId)) {
    return inFlightEpisodeFetch.get(showId);
  }
  const p = fetch(`https://api.tvmaze.com/shows/${showId}/episodes`)
    .then(res => {
      if (!res.ok) throw new Error(`Episodes HTTP ${res.status}`);
      return res.json();
    })
    .then(eps => {
      episodesCache.set(showId, eps);
      inFlightEpisodeFetch.delete(showId);
      return eps;
    })
    .catch(err => {
      inFlightEpisodeFetch.delete(showId);
      throw err;
    });

  inFlightEpisodeFetch.set(showId, p);
  return p;
}

// ===== Shows Listing =====
function renderShows(shows) {
  rootElem.innerHTML = "";
  if (!shows || shows.length === 0) {
    rootElem.innerHTML = "<p>No shows match your search.</p>";
    return;
  }
  const grid = document.createElement("div");
  grid.className = "shows-grid";

  shows.forEach(show => {
    const card = document.createElement("article");
    card.className = "show-card";

    const title = document.createElement("h2");
    title.textContent = show.name;
    title.className = "show-title";
    title.tabIndex = 0;
    title.addEventListener("click", () => goToShow(show.id));

    const img = document.createElement("img");
    img.src = show.image?.medium || "";
    img.alt = show.name || "Show image";

    const summary = document.createElement("div");
    summary.className = "show-summary";
    summary.innerHTML = show.summary || "No summary available.";

    const meta = document.createElement("p");
    const genres = Array.isArray(show.genres) ? show.genres.join(", ") : "N/A";
    const status = show.status || "N/A";
    const rating = (show.rating && show.rating.average) ? show.rating.average : "N/A";
    const runtime = show.runtime ?? "N/A";
    meta.className = "show-meta";
    meta.textContent = `Genres: ${genres} | Status: ${status} | Rating: ${rating} | Runtime: ${runtime} mins`;

    card.append(title, img, summary, meta);
    grid.appendChild(card);
  });

  rootElem.appendChild(grid);
}

function goToShow(showId) {
  selectedShowId = Number(showId);
  setView("episodes");
  searchInput.value = "";
  showLoadingMessage("Loading episodes…");

  loadEpisodesForShow(selectedShowId)
    .catch(err => {
      showErrorMessage("Failed to load episodes for this show.");
      console.error(err);
    });
}
// ===== Episodes View =====
async function loadEpisodesForShow(showId) {
  const episodes = await fetchEpisodesOnce(showId);
  allEpisodes = episodes;
  hideMessage();
  populateEpisodeSelect(allEpisodes);

  const term = searchInput.value.toLowerCase();
  const filtered = filterEpisodes(allEpisodes, term);
  displayEpisodes(filtered);
  updateSearchCount(filtered.length, allEpisodes.length);
}

function displayEpisodes(episodes) {
  rootElem.innerHTML = "";
  if (!episodes || episodes.length === 0) {
    rootElem.innerHTML = "<p>No episodes match your search.</p>";
    return;
  }
  episodes.forEach((episode) => {
    const card = document.createElement("div");
    card.className = "episode-card";

    const title = document.createElement("h3");
    title.textContent = `${episode.name} — ${formatEpisodeCode(episode.season, episode.number)}`;
    card.appendChild(title);

    if (episode.image?.medium) {
      const img = document.createElement("img");
      img.src = episode.image.medium;
      img.alt = episode.name;
      card.appendChild(img);
    }

    const summary = document.createElement("div");
    summary.innerHTML = episode.summary || "No summary available.";
    card.appendChild(summary);

    if (episode.url) {
      const link = document.createElement("a");
      link.href = episode.url;
      link.textContent = "View on TVMaze";
      link.target = "_blank";
      card.appendChild(link);
    }

    rootElem.appendChild(card);
  });
}
function populateEpisodeSelect(episodes) {
  episodeSelect.innerHTML = '<option value="all">Show all episodes</option>';
  episodes.forEach((episode) => {
    const opt = document.createElement("option");
    opt.value = episode.id;
    opt.textContent = `S${String(episode.season).padStart(2, "0")}E${String(
      episode.number
    ).padStart(2, "0")} - ${episode.name}`;
    episodeSelect.appendChild(opt);
  });
  episodeSelect.value = "all";
}

// ===== Filters =====
function filterShows(shows, term) {
  if (!term) return shows;
  return shows.filter(show => {
    const name = (show.name || "").toLowerCase();
    const genres = (Array.isArray(show.genres) ? show.genres.join(" ") : "").toLowerCase();
    const summary = (show.summary || "").toLowerCase();
    return name.includes(term) || genres.includes(term) || summary.includes(term);
  });
}

function filterEpisodes(episodes, term) {
  if (!term) return episodes;
  return episodes.filter(ep =>
    (ep.name || "").toLowerCase().includes(term) ||
    (ep.summary || "").toLowerCase().includes(term)
  );
}

// ===== UI Helpers =====
function updateSearchCount(showing, total) {
  searchCount.textContent = `Showing ${showing} / ${total} episodes`;
}

function formatEpisodeCode(season, number) {
  return `S${String(season).padStart(2, "0")}E${String(number).padStart(2, "0")}`;
}
// ===== Messages =====
function showLoadingMessage(text = "Loading…") {
  rootElem.innerHTML = `<p>${text}</p>`;
}
function showErrorMessage(msg) {
  rootElem.innerHTML = `<p style="color:red;">${msg}</p>`;
}
function hideMessage() {
  rootElem.innerHTML = "";
}