const ACTIVITY_TYPES = ["Activity Type A", "Activity Type B", "Activity Type C"];
const LOGIN_STORAGE_KEY = "activity-options-table-authenticated";

const state = {
  isAuthenticated: !window.APP_CONFIG?.appPassword,
  loginError: "",
  rows: Array.from({ length: 8 }, (_, index) => buildRow(index + 1)),
  activeModal: null,
  mapDebug: "",
  mapMessage: "",
  numericError: "",
};

if (window.APP_CONFIG?.appPassword && window.sessionStorage.getItem(LOGIN_STORAGE_KEY) === "true") {
  state.isAuthenticated = true;
}

const root = document.getElementById("root");
let googleMapsPromise;
let currentMap = null;
let currentMarker = null;
let currentGeocoder = null;

function buildRow(index) {
  return {
    id: `row-${index}`,
    activityType: "",
    activityName: "",
    locationMode: "",
    location: {
      address: "",
      lat: "",
      lng: "",
    },
    direct: category(),
    indirect: category(),
    other: category(),
  };
}

function category() {
  return {
    female: "",
    male: "",
    uploads: [],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getRow(rowId) {
  return state.rows.find((row) => row.id === rowId);
}

function categoryTotal(item) {
  if (hasNonNumeric(item.female) || hasNonNumeric(item.male)) return "";
  if (item.female === "" && item.male === "") return "";
  return (Number(item.female) || 0) + (Number(item.male) || 0);
}

function hasNonNumeric(value) {
  return value !== "" && !/^\d+$/.test(String(value));
}

function isCategoryValid(item) {
  return !hasNonNumeric(item.female) && !hasNonNumeric(item.male);
}

function allRowsValid() {
  return state.rows.every((row) => ["direct", "indirect", "other"].every((key) => isCategoryValid(row[key])));
}

function rowLocationComplete(row, rowIndex) {
  if (rowIndex === 0) return Boolean(row.location.address);
  if (row.locationMode === "above") return true;
  if (row.locationMode === "new") return Boolean(row.location.address);
  return false;
}

function isRowComplete(row, rowIndex) {
  return Boolean(
    row.activityType &&
      row.activityName.trim() &&
      rowLocationComplete(row, rowIndex) &&
      categoryTotal(row.direct) !== "" &&
      categoryTotal(row.indirect) !== "" &&
      categoryTotal(row.other) !== "" &&
      row.direct.uploads.length &&
      row.indirect.uploads.length &&
      row.other.uploads.length
  );
}

function updateRow(rowId, updater) {
  state.rows = state.rows.map((row) => (row.id === rowId ? updater(clone(row)) : row));
  ensureTrailingBlankRow();
}

function isRowBlank(row) {
  return !row.activityType &&
    !row.activityName &&
    !row.location.address &&
    !row.location.lat &&
    !row.location.lng &&
    !row.direct.female &&
    !row.direct.male &&
    !row.indirect.female &&
    !row.indirect.male &&
    !row.other.female &&
    !row.other.male &&
    !row.direct.uploads.length &&
    !row.indirect.uploads.length &&
    !row.other.uploads.length;
}

function ensureTrailingBlankRow() {
  const lastRow = state.rows[state.rows.length - 1];
  if (lastRow && !isRowBlank(lastRow)) {
    state.rows.push(buildRow(state.rows.length + 1));
  }
}

function render() {
  root.innerHTML = state.isAuthenticated ? renderApp() : renderLogin();
  syncAutoTextareas();
  if (state.activeModal?.type === "location") initializeLocationModal();
}

function syncAutoTextareas() {
  root.querySelectorAll(".cell-textarea").forEach((element) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  });
}

function renderLogin() {
  return `
    <div class="page">
      <div class="login-wrap">
        <div class="login-card">
          <h2>Activity Data collection</h2>
          <div class="subtle">Enter the password to open this table version.</div>
          <div class="field" style="margin-top: 16px;">
            <label for="loginPassword">Password</label>
            <input id="loginPassword" type="password" />
          </div>
          ${state.loginError ? `<div class="error-text" style="margin-top:10px;">${escapeHtml(state.loginError)}</div>` : ""}
          <div class="toolbar" style="margin-top: 18px;">
            <div></div>
            <div class="toolbar-actions">
              <button class="btn" data-action="submit-login">Open app</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderApp() {
  return `
    <div class="page">
      <div class="card">
        <div class="toolbar">
          <div>
            <div class="hero-line">Bulk data entry of Activities</div>
            <div class="hero-subline">Click on each cell to enter data</div>
          </div>
          <div class="toolbar-actions">
            <button class="btn" data-action="download-csv">Download CSV</button>
          </div>
        </div>
        ${!allRowsValid() ? `<div class="error-text" style="margin-bottom: 12px;">numbers only</div>` : ""}
        <div class="table-wrap">
          <table>
            <tbody>
              ${state.rows.map(renderRow).join("")}
            </tbody>
          </table>
        </div>
      </div>
      ${renderModal()}
    </div>
  `;
}

function getActiveRowId() {
  const firstIncompleteIndex = state.rows.findIndex((row, index) => !isRowComplete(row, index));
  return firstIncompleteIndex >= 0 ? state.rows[firstIncompleteIndex].id : state.rows[state.rows.length - 1]?.id;
}

function renderRow(row) {
  const activeRowId = getActiveRowId();
  const rowNumber = Number(row.id.replace("row-", ""));
  const previousRow = rowNumber > 1 ? getRow(`row-${rowNumber - 1}`) : null;
  const directSummary = isCategoryValid(row.direct) && categoryTotal(row.direct) !== "" ? categoryTotal(row.direct) : "";
  const indirectSummary = isCategoryValid(row.indirect) && categoryTotal(row.indirect) !== "" ? categoryTotal(row.indirect) : "";
  const otherSummary = isCategoryValid(row.other) && categoryTotal(row.other) !== "" ? categoryTotal(row.other) : "";
  return `
    <tr class="${row.id === activeRowId ? "active-entry-row" : ""}">
      <td style="width:12%;">
        <div class="cell-trigger cell-entry">
          <span class="cell-label">Choose<br>Activity Type</span>
          <select class="cell-input ${row.activityType ? "filled-value" : ""}" data-action="set-activity-type" data-row-id="${row.id}">
            <option value=""></option>
            ${ACTIVITY_TYPES.map((type) => `<option value="${escapeHtml(type)}" ${row.activityType === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
          </select>
        </div>
      </td>
      <td style="width:29.4%;">
        <div class="cell-trigger cell-entry">
          <span class="cell-label">Enter Activity Name</span>
          <textarea class="cell-input cell-textarea ${row.activityName ? "filled-value" : ""}" data-action="set-activity-name" data-row-id="${row.id}">${escapeHtml(row.activityName)}</textarea>
        </div>
      </td>
      <td style="width:29.4%;">
        ${
          rowNumber === 1
            ? `<button class="cell-trigger" data-action="open-location" data-row-id="${row.id}">
                <span class="cell-label">Enter Activity Location</span>
                <span class="cell-value filled-value">${escapeHtml(row.location.address || "")}</span>
              </button>`
            : `<div class="cell-trigger cell-choice">
                <span class="cell-label choice-line">Use location from row above <input type="checkbox" data-action="set-location-mode" data-row-id="${row.id}" data-mode="above" ${
                  row.locationMode === "above" ? "checked" : ""
                } /><br>or enter new <input type="checkbox" data-action="set-location-mode" data-row-id="${row.id}" data-mode="new" ${
                  row.locationMode === "new" ? "checked" : ""
                } /></span>
                <span class="cell-value filled-value">${
                  row.locationMode === "above"
                    ? escapeHtml(previousRow?.location.address || "")
                    : escapeHtml(row.location.address || "")
                }</span>
              </div>`
        }
      </td>
      <td style="width:12%;">
        <button class="cell-trigger" data-action="open-beneficiaries" data-row-id="${row.id}" data-group="direct">
          <span class="cell-label">Enter Direct Beneficiaries</span>
          <span class="cell-value filled-value">${escapeHtml(directSummary)}</span>
        </button>
      </td>
      <td style="width:12%;">${renderUploadCell(row, "direct")}</td>
      <td style="width:12%;">
        <button class="cell-trigger" data-action="open-beneficiaries" data-row-id="${row.id}" data-group="indirect">
          <span class="cell-label">Enter Indirect Beneficiaries</span>
          <span class="cell-value filled-value">${escapeHtml(indirectSummary)}</span>
        </button>
      </td>
      <td style="width:12%;">${renderUploadCell(row, "indirect")}</td>
      <td style="width:12%;">
        <button class="cell-trigger" data-action="open-beneficiaries" data-row-id="${row.id}" data-group="other">
          <span class="cell-label">Enter Other Beneficiaries</span>
          <span class="cell-value filled-value">${escapeHtml(otherSummary)}</span>
        </button>
      </td>
      <td style="width:12%;">${renderUploadCell(row, "other")}</td>
    </tr>
  `;
}

function renderUploadCell(row, groupKey) {
  const files = row[groupKey].uploads;
  const title =
    groupKey === "direct"
      ? "Upload Direct Documentation"
      : groupKey === "indirect"
      ? "Upload Indirect Documentation"
      : "Upload Other Documentation";
  return `
    <label class="cell-trigger">
      <span class="cell-label">${title}</span>
      <span class="cell-value filled-value">${escapeHtml(files.length ? files.join(", ") : "")}</span>
      <input type="file" hidden multiple data-action="upload-files" data-row-id="${row.id}" data-group="${groupKey}" />
    </label>
  `;
}

function renderModal() {
  if (!state.activeModal) return "";
  if (state.activeModal.type === "location") return renderLocationModal();
  return renderBeneficiaryModal();
}

function renderLocationModal() {
  const row = getRow(state.activeModal.rowId);
  const hasApiKey = Boolean(window.APP_CONFIG?.googleMapsApiKey);
  const useFallback = !hasApiKey || state.mapMessage.includes("fallback");
  return `
    <div class="modal-shell">
      <div class="modal-card" data-modal-card="true">
        <div class="modal-header">
          <div>
            <h2>Activity Location</h2>
            <div class="subtle">Row ${escapeHtml(row.id.replace("row-", ""))}</div>
          </div>
          <button class="ghost-btn" data-action="close-modal">Close</button>
        </div>
        <div class="modal-grid">
          <div class="stack">
            <div class="field">
              <label for="modalAddress">Address</label>
              <input id="modalAddress" value="${escapeHtml(row.location.address)}" data-action="modal-address" />
            </div>
            <div class="toolbar-actions">
              <button class="btn" data-action="save-location-search" data-row-id="${row.id}">Save address</button>
            </div>
            <div class="mini-card">
              <div class="subtle">Stored location</div>
              <strong>${escapeHtml(row.location.address || "No location set")}</strong>
              <div class="subtle" style="margin-top:6px;">${escapeHtml(row.location.lat && row.location.lng ? `${row.location.lat}, ${row.location.lng}` : "Click the map to set coordinates")}</div>
              ${state.mapMessage ? `<div class="error-text" style="margin-top:8px;">${escapeHtml(state.mapMessage)}</div>` : ""}
              ${state.mapDebug ? `<div class="subtle" style="margin-top:8px;font-size:0.82rem;">${escapeHtml(state.mapDebug)}</div>` : ""}
            </div>
          </div>
          <div class="map-box">
            ${useFallback ? renderFallbackMap(row) : `<div id="modalMap" class="map-surface"></div>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFallbackMap(row) {
  const hasPin = row.location.lat !== "" && row.location.lng !== "";
  return `
    <div class="map-fallback" id="fallbackMapSurface">
      ${
        hasPin
          ? `<div class="fallback-pin" style="left:${((Number(row.location.lng) + 180) / 360) * 100}%;top:${((85 - Number(row.location.lat)) / 170) * 100}%;"></div>`
          : ""
      }
      <div class="map-note">Click anywhere here to store coordinates. The address field will stay editable above.</div>
    </div>
  `;
}

function renderBeneficiaryModal() {
  const row = getRow(state.activeModal.rowId);
  const groupKey = state.activeModal.group;
  const label = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
  const category = row[groupKey];
  const total = categoryTotal(category);
  const hasError = hasNonNumeric(category.female) || hasNonNumeric(category.male);
  return `
    <div class="modal-shell">
      <div class="modal-card" data-modal-card="true" style="width:min(700px,88vw);">
        <div class="modal-header">
          <div>
            <h2>${label} Beneficiaries</h2>
            <div class="subtle">Enter Female and Male disaggregations</div>
          </div>
          <button class="ghost-btn" data-action="close-modal">Close</button>
        </div>
        <div class="bene-grid">
          <div class="field">
            <label>Female</label>
            <input type="text" inputmode="numeric" value="${escapeHtml(category.female)}" data-action="modal-beneficiaries" data-row-id="${row.id}" data-group="${groupKey}" data-field="female" />
          </div>
          <div class="field">
            <label>Male</label>
            <input type="text" inputmode="numeric" value="${escapeHtml(category.male)}" data-action="modal-beneficiaries" data-row-id="${row.id}" data-group="${groupKey}" data-field="male" />
          </div>
          <div class="field total-readout">
            <label>Total</label>
            <div class="total-text">${escapeHtml(total)}</div>
          </div>
        </div>
        <div style="margin-top:14px;">
          ${hasError || state.numericError ? `<span class="error-text">numbers only</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function initializeLocationModal() {
  const row = getRow(state.activeModal.rowId);
  const fallback = document.getElementById("fallbackMapSurface");
  if (fallback) {
    fallback.addEventListener("click", (event) => {
      const bounds = fallback.getBoundingClientRect();
      const lat = 85 - ((event.clientY - bounds.top) / bounds.height) * 170;
      const lng = -180 + ((event.clientX - bounds.left) / bounds.width) * 360;
      updateRow(row.id, (next) => {
        next.location.lat = lat.toFixed(6);
        next.location.lng = lng.toFixed(6);
        next.location.address = getModalAddress() || `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        return next;
      });
      state.mapMessage = "";
      render();
    });
    return;
  }

  loadGoogleMaps(window.APP_CONFIG.googleMapsApiKey)
    .then((google) => {
      const center =
        row.location.lat && row.location.lng
          ? { lat: Number(row.location.lat), lng: Number(row.location.lng) }
          : { lat: 37.7749, lng: -122.4194 };
      const map = new google.maps.Map(document.getElementById("modalMap"), {
        center,
        zoom: row.location.lat ? 14 : 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      const marker = new google.maps.Marker({ map });
      const geocoder = new google.maps.Geocoder();
      currentMap = map;
      currentMarker = marker;
      currentGeocoder = geocoder;
      state.mapDebug = "Google Maps script loaded successfully.";
      state.mapMessage = "";
      if (row.location.lat && row.location.lng) marker.setPosition(center);

      map.addListener("click", (event) => {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        marker.setPosition({ lat, lng });
        reverseGeocodeRow(row.id, lat, lng);
      });

      const input = document.getElementById("modalAddress");
      const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ["formatted_address", "geometry"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        updateRow(row.id, (next) => {
          next.location.address = place.formatted_address || input.value;
          next.location.lat = lat.toFixed(6);
          next.location.lng = lng.toFixed(6);
          return next;
        });
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
        map.setZoom(14);
        state.mapMessage = "";
        render();
      });
    })
    .catch((error) => {
      state.mapMessage = "Google Maps could not load here. Using fallback click map.";
      state.mapDebug = error && error.message ? error.message : String(error);
      render();
    });
}

function geocodeModalAddress(rowId) {
  const address = getModalAddress();
  if (!currentGeocoder || !address) return;

  currentGeocoder.geocode({ address }, (results, status) => {
    if (status === "OK" && results && results[0] && results[0].geometry) {
      const lat = results[0].geometry.location.lat();
      const lng = results[0].geometry.location.lng();
      updateRow(rowId, (next) => {
        next.location.address = results[0].formatted_address || address;
        next.location.lat = lat.toFixed(6);
        next.location.lng = lng.toFixed(6);
        return next;
      });
      if (currentMap && currentMarker) {
        currentMap.panTo({ lat, lng });
        currentMap.setZoom(14);
        currentMarker.setPosition({ lat, lng });
      }
      state.mapMessage = "";
    } else {
      state.mapMessage = "Google could not place that address automatically. Click the map to pin it instead.";
    }
    state.activeModal = null;
    render();
  });
}

function reverseGeocodeRow(rowId, lat, lng) {
  updateRow(rowId, (next) => {
    next.location.lat = lat.toFixed(6);
    next.location.lng = lng.toFixed(6);
    next.location.address = getModalAddress() || `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    return next;
  });

  if (!currentGeocoder) {
    state.mapMessage = "";
    render();
    return;
  }

  currentGeocoder.geocode({ location: { lat, lng } }, (results, status) => {
    if (status === "OK" && results && results[0]) {
      updateRow(rowId, (next) => {
        next.location.address = results[0].formatted_address;
        return next;
      });
      state.mapMessage = "";
    } else {
      state.mapMessage = "Coordinates were saved, but Google could not look up a formatted address.";
    }
    render();
  });
}

function getModalAddress() {
  const input = document.getElementById("modalAddress");
  return input ? input.value.trim() : "";
}

function buildCsv() {
  const header = [
    "Activity Type",
    "Activity Name",
    "Activity Location",
    "Latitude",
    "Longitude",
    "Direct Total",
    "Direct Female",
    "Direct Male",
    "Direct Uploads",
    "Indirect Total",
    "Indirect Female",
    "Indirect Male",
    "Indirect Uploads",
    "Other Total",
    "Other Female",
    "Other Male",
    "Other Uploads",
  ];

  const rows = state.rows.map((row) => [
    row.activityType,
    row.activityName,
    row.location.address,
    row.location.lat,
    row.location.lng,
    categoryTotal(row.direct),
    row.direct.female,
    row.direct.male,
    row.direct.uploads.join(" | "),
    categoryTotal(row.indirect),
    row.indirect.female,
    row.indirect.male,
    row.indirect.uploads.join(" | "),
    categoryTotal(row.other),
    row.other.female,
    row.other.male,
    row.other.uploads.join(" | "),
  ]);

  return [header, ...rows]
    .map((columns) => columns.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function downloadCsv() {
  if (!allRowsValid()) {
    window.alert("numbers only");
    return;
  }
  const csv = buildCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "activity-data-collection-table.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function handleAction(event) {
  const target =
    event.target.closest("[data-action]") || event.target;
  const action = target.dataset.action;
  if (!action) return;

  if (action === "submit-login") {
    const input = document.getElementById("loginPassword");
    const password = input ? input.value : "";
    if (password === window.APP_CONFIG?.appPassword) {
      state.isAuthenticated = true;
      state.loginError = "";
      window.sessionStorage.setItem(LOGIN_STORAGE_KEY, "true");
    } else {
      state.loginError = "Incorrect password.";
    }
    render();
    return;
  }

  if (action === "download-csv") {
    downloadCsv();
    return;
  }

  if (action === "open-location") {
    state.activeModal = { type: "location", rowId: target.dataset.rowId };
    state.mapMessage = "";
    state.mapDebug = "";
    render();
    return;
  }

  if (action === "open-beneficiaries") {
    state.activeModal = {
      type: "beneficiaries",
      rowId: target.dataset.rowId,
      group: target.dataset.group,
    };
    state.numericError = "";
    render();
    return;
  }

  if (action === "close-modal") {
    state.activeModal = null;
    state.mapMessage = "";
    state.numericError = "";
    render();
    return;
  }

  if (action === "set-location-mode") {
    const rowId = target.dataset.rowId;
    const rowNumber = Number(rowId.replace("row-", ""));
    const shouldOpenLocation = target.checked && target.dataset.mode === "new";
    updateRow(rowId, (next) => {
      next.locationMode = target.checked ? target.dataset.mode : "";
      if (target.checked && target.dataset.mode === "above" && rowNumber > 1) {
        const previousRow = getRow(`row-${rowNumber - 1}`);
        next.location = clone(previousRow?.location || next.location);
      }
      return next;
    });
    if (shouldOpenLocation) {
      state.activeModal = { type: "location", rowId };
      state.mapMessage = "";
      state.mapDebug = "";
    }
    render();
    return;
  }

  if (action === "save-location-search") {
    const rowId = target.dataset.rowId;
    const address = getModalAddress();
    updateRow(rowId, (next) => {
      next.location.address = address;
      return next;
    });
    const row = getRow(rowId);
    state.activeModal = null;
    render();
    if (currentGeocoder && address) {
      geocodeModalAddress(rowId);
      return;
    }
    state.mapMessage = row.location.lat && row.location.lng ? "" : "Saved address. Click the map to store coordinates.";
    render();
  }
}

function handleInput(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (!action) return;

  if (action === "set-activity-type") {
    updateRow(target.dataset.rowId, (next) => {
      next.activityType = target.value;
      return next;
    });
    return;
  }

  if (action === "set-activity-name") {
    updateRow(target.dataset.rowId, (next) => {
      next.activityName = target.value;
      return next;
    });
    return;
  }

  if (action === "modal-address") {
    updateRow(state.activeModal.rowId, (next) => {
      next.location.address = target.value;
      return next;
    });
    return;
  }

  if (action === "modal-beneficiaries") {
    if (target.value !== "" && !/^\d+$/.test(target.value)) {
      state.numericError = "numbers only";
      render();
      return;
    }
    state.numericError = "";
    updateRow(target.dataset.rowId, (next) => {
      next[target.dataset.group][target.dataset.field] = target.value;
      return next;
    });
    render();
    return;
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.dataset.action === "upload-files") {
    const files = Array.from(target.files || []).map((file) => file.name);
    updateRow(target.dataset.rowId, (next) => {
      next[target.dataset.group].uploads = files;
      return next;
    });
    render();
  }
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps script loaded, but Places is unavailable."));
      }
    };
    script.onerror = () => reject(new Error("Google Maps script failed to load."));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

root.addEventListener("click", handleAction);
root.addEventListener("input", handleInput);
root.addEventListener("change", handleChange);

render();
