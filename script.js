const form = document.getElementById('resume-form');
form.addEventListener('input', updatePreview);
setInterval(updatePreview, 10000); // auto-save every 10s

function updatePreview() {
  const data = getFormData();
  localStorage.setItem('resumeData', JSON.stringify(data));
  document.querySelector('.autosave').style.display = 'block';
  setTimeout(() => document.querySelector('.autosave').style.display = 'none', 2000);

  const skillsHtml = data.skills ? data.skills.split(',').map(s => `<span class="skill">${s.trim()}</span>`).join('') : '';

  const parseSection = (text) => {
    if (!text) return '';
    return text.split('\n').filter(line => line.trim()).map(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 3) return `<p>${line}</p>`;
      return `
        <div class="experience-entry">
          <div class="experience-role">${parts[0]}</div>
          <div class="experience-date">${parts[1]}</div>
          ${parts.slice(2).map(b => `<p>• ${b}</p>`).join('')}
        </div>
      `;
    }).join('');
  };

  const previewHtml = `
    <h1>${data.name || 'Your Name'}</h1>
    <p>${data.role || 'Role / Headline (e.g., Full-Stack Developer)'}</p>
    <p>${(data.summary || '').replace(/\n/g, '<br>')}</p>
    <h2>Skills</h2>
    <p>${skillsHtml}</p>
    <h2>Experience</h2>
    ${parseSection(data.experience)}
    <h2>Education</h2>
    ${parseSection(data.education)}
    <h2>Projects</h2>
    ${parseSection(data.projects)}
    <h2>Certifications</h2>
    ${parseSection(data.certifications)}
    <p>Phone: ${data.phone || ''} | Location: ${data.location || ''}</p>
    <p>Website: ${data.website || ''} | LinkedIn: ${data.linkedin || ''} | GitHub: ${data.github || ''}</p>
  `;

  document.getElementById('preview').innerHTML = previewHtml;
}

function getFormData() {
  return {
    name: document.getElementById('name')?.value || '',
    role: document.getElementById('role')?.value || '',
    summary: document.getElementById('summary')?.value || '',
    skills: document.getElementById('skills')?.value || '',
    experience: document.getElementById('experience')?.value || '',
    education: document.getElementById('education')?.value || '',
    phone: document.getElementById('phone')?.value || '',
    location: document.getElementById('location')?.value || '',
    website: document.getElementById('website')?.value || '',
    linkedin: document.getElementById('linkedin')?.value || '',
    github: document.getElementById('github')?.value || '',
    projects: document.getElementById('projects')?.value || '',
    certifications: document.getElementById('certifications')?.value || ''
  };
}

function copyHTML() {
  const preview = document.getElementById('preview').outerHTML;
  navigator.clipboard.writeText(`<html><head><style>${document.querySelector('style').innerHTML}</style></head><body>${preview}</body></html>`);
  alert('HTML copied!');
}

function printPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  html2canvas(document.getElementById('preview'), {scale: 2}).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 10, 10, 190, 0);  // auto height
    doc.save('resume.pdf');
  });
}

function resetForm() {
  if (confirm('Reset all fields?')) {
    document.getElementById('resume-form').reset();
    updatePreview();
    localStorage.removeItem('resumeData');
  }
}

// Load from localStorage on start
if (localStorage.getItem('resumeData')) {
  const data = JSON.parse(localStorage.getItem('resumeData'));
  Object.keys(data).forEach(key => {
    const elem = document.getElementById(key);
    if (elem) elem.value = data[key];
  });
  updatePreview();
}

updatePreview();  // initial load