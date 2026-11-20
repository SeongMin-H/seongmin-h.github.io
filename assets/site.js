(function () {
	// Subpages are already put at the top by a small script right after <body>.
	// If the browser or a surrounding frame moves the view while images load, put it back once,
	// unless the visitor has already started scrolling.
	if (document.body.getAttribute('data-page') === 'sub' && !location.hash) {
		var moved = false;
		['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
			window.addEventListener(ev, function () { moved = true; }, { once: true, passive: true });
		});
		window.addEventListener('load', function () {
			if (moved) return;
			window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
			try {
				document.body.scrollIntoView({ block: 'start', behavior: 'instant' });
			} catch (e) {}
		});
	}

	// Mobile menu
	var btn = document.querySelector('.menu-btn');
	var nav = document.getElementById('site-nav');
	if (btn && nav) {
		btn.addEventListener('click', function () {
			var open = nav.classList.toggle('open');
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
		});
		nav.addEventListener('click', function (e) {
			if (e.target.closest('a')) {
				nav.classList.remove('open');
				btn.setAttribute('aria-expanded', 'false');
			}
		});
	}

	// Highlight the nav item for the section being read (home page).
	// Computed from scroll position so it also works when the page sits inside a frame.
	var links = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
	var sections = links.map(function (a) {
		return document.getElementById(a.getAttribute('href').slice(1));
	});
	if (links.length && sections.every(Boolean)) {
		var setCurrent = function (i) {
			links.forEach(function (a, j) {
				if (j === i) a.setAttribute('aria-current', 'true');
				else a.removeAttribute('aria-current');
			});
		};
		var update = function () {
			var line = 72 + window.innerHeight * 0.3;
			var current = 0;
			sections.forEach(function (sec, i) {
				if (sec.getBoundingClientRect().top <= line) current = i;
			});
			var doc = document.documentElement;
			if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) current = sections.length - 1;
			setCurrent(current);
		};
		var ticking = false;
		var onScroll = function () {
			if (ticking) return;
			ticking = true;
			window.requestAnimationFrame(function () {
				ticking = false;
				update();
			});
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		links.forEach(function (a, i) {
			a.addEventListener('click', function () { setCurrent(i); });
		});
		update();
	}

	// Gallery folders: load 1.jpg, 2.jpg, ... in order until a number is missing.
	// Adding photos only means dropping numbered files into the folder.
	document.querySelectorAll('[data-photo-dir]').forEach(function (grid) {
		var dir = grid.getAttribute('data-photo-dir');
		var label = grid.getAttribute('data-photo-label') || 'Photo';
		var n = 1;
		var next = function () {
			var img = new Image();
			img.onload = function () {
				if (n === 1) grid.innerHTML = '';
				var tile = document.createElement('button');
				tile.className = 'frame';
				tile.type = 'button';
				tile.style.aspectRatio = img.naturalHeight > img.naturalWidth ? '4 / 5' : '4 / 3';
				tile.setAttribute('aria-label', 'Enlarge photo ' + n + ': ' + label);
				img.alt = label + ', photo ' + n;
				tile.appendChild(img);
				grid.appendChild(tile);
				n += 1;
				if (n <= 60) next();
			};
			img.src = dir + n + '.jpg';
		};
		next();
	});

	// Photo lightbox (gallery page)
	var box = document.querySelector('.lightbox');
	if (box && typeof box.showModal === 'function') {
		var big = box.querySelector('img');
		document.addEventListener('click', function (e) {
			var tile = e.target.closest('.photos .frame');
			if (!tile) return;
			var img = tile.querySelector('img');
			if (!img) return;
			big.src = img.getAttribute('data-full') || img.src;
			big.alt = img.alt;
			box.showModal();
		});
		box.addEventListener('click', function (e) {
			if (e.target === box || e.target.closest('button')) box.close();
		});
	}
})();
