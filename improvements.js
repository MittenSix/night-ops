// Small usability repairs layered on top of the prototype's existing lessons.
// Keeping these here makes the temporary prototype easier to evolve without
// changing any of the lesson content itself.

route = function (name) {
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.toggle('active', page.id === name);
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === name);
  });

  if (!preserveLessonPosition) window.scrollTo({ top: 0, behavior: 'auto' });
  preserveLessonPosition = false;
};

const verificationPrompts = {
  ropes: 'Check your work with a buddy or leader. It should be neat, secure, and suitable for this practice—not for life safety.',
  'first-aid': 'Practice a calm handoff: say what happened, where you are, and which adult is helping.',
  navigation: 'Check your plan with a buddy: name your boundary, landmark, and leader check-in point.',
  fire: 'Check with the adult fire lead that the area, water, and safe boundary are ready before marking this practice.',
  observation: 'Check with your buddy: are you both ready, accounted for, and clear on the next safe step?',
  morse: 'Check the message together, then try sending or reading it once more at a calm pace.'
};

Object.entries(curriculum).forEach(([skillId, path]) => {
  path.forEach((lesson) => {
    const lastStep = lesson[3].length - 1;
    if (/Check your work: compare it with the picture/.test(lesson[3][lastStep] || '')) {
      lesson[3][lastStep] = verificationPrompts[skillId];
    }
  });
});

refresh();
