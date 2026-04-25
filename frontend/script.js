const API = "https://family-tree-app-i1rl.onrender.com";
const token = localStorage.getItem("token");

// 🔐 Auth check
if (!token) {
  window.location.href = "login.html";
}

function handleRelationChange() {
  const relation = document.getElementById("relationType").value;
  const customInput = document.getElementById("customRelation");

  if (relation === "Other") {
    customInput.classList.remove("hidden");
  } else {
    customInput.classList.add("hidden");
    customInput.value = "";
  }

  // 🔥 IMPORTANT FIX
  loadData(); // dropdown refresh
}

// ==========================
// ADD PERSON (WITH IMAGE)
// ==========================
async function addPerson() {
  const nameInput = document.getElementById("name");
  const genderSelect = document.getElementById("gender");
  const fatherSelect = document.getElementById("fatherSelect");
  const motherSelect = document.getElementById("motherSelect");
  const spouseSelect = document.getElementById("spouseSelect");
  const birthDateInput = document.getElementById("birthDate");
  const deathDateInput = document.getElementById("deathDate");
  const birthPlaceInput = document.getElementById("birthPlace");
  const profilePicInput = document.getElementById("profilePic");
  const relationTypeInput = document.getElementById("relationType");
  const formData = new FormData();

  formData.append("name", nameInput.value);
  formData.append("gender", genderSelect.value);
  const customRelation = document.getElementById("customRelation").value;

  if (relationTypeInput.value === "Other" && customRelation) {
    formData.append("relationType", customRelation);
  } else {
    formData.append("relationType", relationTypeInput.value);
  }
  formData.append("fatherId", fatherSelect.value);
  formData.append("motherId", motherSelect.value);
  formData.append("spouseId", spouseSelect.value);
  formData.append("birthDate", birthDateInput.value);
  formData.append("deathDate", deathDateInput.value);
  formData.append("birthPlace", birthPlaceInput.value);

  const file = profilePicInput?.files[0];
  if (file) {
    formData.append("profilePic", file);
  }

  try {
    await fetch(API + "/add", {
      method: "POST",
          headers: {"Authorization": "Bearer " + localStorage.getItem("token")},
          body: formData
    });

    // CLEAR FIELDS
    nameInput.value = "";
    genderSelect.selectedIndex = 0;
    fatherSelect.value = "";
    motherSelect.value = "";
    spouseSelect.value = "";
    birthDateInput.value = "";
    deathDateInput.value = "";
    birthPlaceInput.value = "";
    relationTypeInput.selectedIndex = 0;
    // 🔥 FIX START
    const customRelationInput = document.getElementById("customRelation");
    if (customRelationInput) {
      customRelationInput.value = "";           // clear text
      customRelationInput.classList.add("hidden"); // hide box
    }
    if (profilePicInput) profilePicInput.value = "";

    loadData();

  } catch (err) {
    console.error("Add error:", err);
  }
}

// ==========================
// LOGOUT
// ==========================
function logout() {
  localStorage.removeItem("token");
  window.location.href = "home.html";
}

const treeEl = document.getElementById("tree");
if (treeEl) {
  treeEl.innerHTML = "";
}
// LOAD DATA
// ==========================
async function loadData() {
  try {
    const res = await fetch(API + "/all", {
      headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    });

    console.log("TOKEN:", localStorage.getItem("token"));
    const data = await res.json();

      if (!res.ok) {
        console.error("Auth Error:", data);
        alert("Session expired, login again");
        localStorage.removeItem("token");
        window.location.href = "login.html";
        return;
      }

      populateDropdown(data);

    const trees = buildTree(data);

    const container = document.getElementById("tree");
    if (container) {
      container.innerHTML = "";

      if (trees.length === 0) {
        container.innerHTML = "<p class='text-center text-gray-500'>No tree data available</p>";
        return;
      }

      if (trees.length > 0) {
      //drawTree(trees[0]); // 🔥 only first root
      // 👉 Prefer MALE root (father lineage stable hoti hai)
      let root = trees.find(t => !t.fatherId && !t.motherId);

      // fallback
      if (!root) root = trees[0];

       // agar ek hi tree chahiye
      //drawTree(root);

      // 🔥 agar multiple trees bhi dikhane hain:
      trees.forEach(t => drawTree(t));
      }
    }

  } catch (err) {
    console.error("Load error:", err);
  }
}

// ==========================
// DROPDOWNS
// ==========================
function populateDropdown(data) {
  const fatherSelect = document.getElementById("fatherSelect");
  const motherSelect = document.getElementById("motherSelect");
  const spouseSelect = document.getElementById("spouseSelect");

  if (!fatherSelect || !motherSelect || !spouseSelect) return;

  fatherSelect.innerHTML = '<option value="">Select Father</option>';
  motherSelect.innerHTML = '<option value="">Select Mother</option>';
  spouseSelect.innerHTML = '<option value="">Select Spouse</option>';

  data.forEach(p => {
    if (p.gender === "Male") {
      fatherSelect.innerHTML += `<option value="${p._id}">${p.name}</option>`;
    }
    if (p.gender === "Female") {
      motherSelect.innerHTML += `<option value="${p._id}">${p.name}</option>`;
    }

    spouseSelect.innerHTML += `<option value="${p._id}">${p.name} (${p.gender})</option>`;
  });
}

// ==========================
// BUILD TREE (🔥 FIXED)
// ==========================
function buildTree(data) {
  const map = {};

  // Create map
  data.forEach(p => {
    map[p._id] = { ...p, children: [], spouse: null };
  });

  // ==========================
  // 🔥 SPOUSE FIX (MAIN FIX)
  // ==========================
  data.forEach(p => {
    // normal spouse
    if (p.spouseId && map[p.spouseId]) {
      map[p._id].spouse = map[p.spouseId];
      map[p.spouseId].spouse = map[p._id];
    }

    // 🔥 reverse spouse fix (VERY IMPORTANT)
    const reverse = data.find(x => x.spouseId === p._id);
    if (reverse) {
      map[p._id].spouse = map[reverse._id];
      map[reverse._id].spouse = map[p._id];
    }
  });

  // ==========================
  // 🔥 PARENT-CHILD LINK FIX
  // ==========================
  data.forEach(p => {
    // 👨 father link
    if (p.fatherId && map[p.fatherId]) {
      const father = map[p.fatherId];

      if (!father.children.find(c => c._id === p._id)) {
        father.children.push(map[p._id]);
      }

      if (father.spouse) {
        if (!father.spouse.children.find(c => c._id === p._id)) {
          father.spouse.children.push(map[p._id]);
        }
      }
    }

    // 👩 mother link
    if (p.motherId && map[p.motherId]) {
      const mother = map[p.motherId];

      if (!mother.children.find(c => c._id === p._id)) {
        mother.children.push(map[p._id]);
      }

      if (mother.spouse) {
        if (!mother.spouse.children.find(c => c._id === p._id)) {
          mother.spouse.children.push(map[p._id]);
        }
      }
    }
  });

  // ==========================
  // 🔥 ROOT FIX
  // ==========================
  const roots = [];

  data.forEach(p => {
    if (!p.fatherId && !p.motherId) {
      roots.push(map[p._id]);
    }
  });

  return roots;
}

// ==========================
// DRAW TREE
// ==========================
function drawTree(treeData) {
  const container = document.getElementById("tree");

  const width = 900;
  const height = 500;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#f9fafb")
    .style("border-radius", "10px")
    .style("margin-bottom", "30px");

  const root = d3.hierarchy(treeData);
  const treeLayout = d3.tree().size([width - 100, height - 100]);

  treeLayout(root);

  // Links
  svg.selectAll("path")
    .data(root.links())
    .enter()
    .append("path")
    .attr("d", d3.linkVertical()
      .x(d => d.x + 50)
      .y(d => d.y + 50)
    )
    .attr("fill", "none")
    .attr("stroke", "#94a3b8")
    .attr("stroke-width", 2);

  // Nodes
  const node = svg.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("transform", d => `translate(${d.x + 50}, ${d.y + 50})`);

  // Circle
  node.append("circle")
    .attr("r", 28)
    .attr("fill", d => d.data.gender === "Male" ? "#60a5fa" : "#f472b6")
    .attr("stroke", "#1e293b")
    .attr("stroke-width",3)
    .on("mouseover", function () {
      d3.select(this).attr("r", 40);
    })
    .on("mouseout", function () {
      d3.select(this).attr("r", 32);
    });

  // Label
  node.append("text")
    .attr("dy", 6)
    .attr("text-anchor", "middle")
    .style("font-size", "23px")
    .style("font-weight", "bold")
    .style("fill", "#111827")
    .style("pointer-events", "none")
    .text(d => {
      let label = d.data.name;

      if (d.data.relationType) {
        label += " (" + d.data.relationType + ")";
      }

      if (d.data.spouse) {
        let spouseLabel = d.data.spouse.name;

        if (d.data.spouse.relationType) {
          spouseLabel += " (" + d.data.spouse.relationType + ")";
        }

        return label + " ❤️ " + spouseLabel;
      }

      return label;
    });

  // Tooltip
  node.append("title")
    .text(d => {
      if (d.data.spouse) {
        return `Person: ${d.data.name}
Gender: ${d.data.gender}

Spouse: ${d.data.spouse.name}`;
      }
      return `Person: ${d.data.name}`;
    });

  // Background for text
  node.insert("rect", "text")
    .attr("x", -45)
    .attr("y", -12)
    .attr("width", 110)
    .attr("height", 27)
    .attr("fill", "white")
    .attr("rx", 6)
}

// ==========================
// INIT
// ==========================
loadData();