export function renderHome(app, catalog, money) {
  app.innerHTML = `
    <section class="home-hero">
      <div class="home-copy">
        <div class="eyebrow">WELCOME TO SLOTBOOK</div>
        <h1>Look good.<br>Feel like <em>you.</em></h1>
        <p>A fresh cut, a little care, a moment to reset. Find your favourite treatment and book a time that’s just yours.</p>
        <a class="primary button-link" href="/book">Book an appointment <span aria-hidden="true">↗</span></a>
        <p class="home-caption">Two caring stylists. Four feel-good treatments.</p>
      </div>
      <div class="salon-scene" aria-hidden="true">
        <span class="scene-label">YOUR TIME TO SHINE</span>
        <div class="mirror"><div class="mirror-inner"><span class="mirror-star">✳</span><span class="mirror-text">a fresh<br>perspective.</span></div></div>
        <div class="salon-chair"><div class="chair-back"></div><div class="chair-seat"></div><div class="chair-stem"></div><div class="chair-base"></div></div>
        <div class="scene-ticket"><span>MADE FOR YOU</span><strong>A little self-care<br>goes a long way.</strong></div>
        <span class="scene-bottom">THE SLOTBOOK SALON</span>
      </div>
    </section>
    <section class="home-services" aria-labelledby="treatments-title">
      <div class="section-heading"><div><div class="eyebrow">THE TREATMENT MENU</div><h2 id="treatments-title">Small rituals. Fresh starts.</h2></div><p>Choose what feels right for you.</p></div>
      <div class="treatment-list">${catalog.services
        .map(
          (service, index) => `
        <a class="treatment-row" href="/book?service=${service.id}">
          <span class="treatment-number">0${index + 1}</span><span class="treatment-name">${service.name}</span>
          <span class="treatment-duration">${service.duration} min</span><span class="treatment-price">${money(service.price)}</span><span aria-hidden="true">↗</span>
        </a>`,
        )
        .join("")}</div>
    </section>
    <section class="home-team" aria-labelledby="team-title">
      <div><div class="eyebrow">GOOD HANDS, GREAT HAIR</div><h2 id="team-title">Meet your people.</h2><p>Pick your stylist, or choose “Any stylist” and we’ll find an available pair of hands.</p></div>
      <div class="team-members"><article class="stylist-profile"><span class="avatar" aria-hidden="true">M</span><div><h3>Meera</h3><p>Mon–Sat · 10:00–19:00<br>Break · 13:00–14:00</p></div></article><article class="stylist-profile"><span class="avatar" aria-hidden="true">K</span><div><h3>Karan</h3><p>Tue–Sun · 11:00–20:00<br>Break · 15:00–15:30</p></div></article></div>
    </section>
    <section class="home-bottom"><span class="eyebrow">MAKE SOME TIME FOR YOURSELF</span><h2>Your next good hair day starts here.</h2><a class="primary button-link" href="/book">Find your appointment <span aria-hidden="true">→</span></a><p>Already booked? Open the private management link from your confirmation to reschedule.</p></section>`;
}
