/*
 * Every figure in this guide is a screenshot of an interface, drawn into a
 * column narrower than the capture: the control a sentence names can be a few
 * pixels wide by the time it is on the page. Clicking a figure opens it at the
 * largest size the build produced.
 *
 * Written here rather than taken from a plugin: the site serves everything from
 * its own origin, and this is a dialog, an image, and one listener.
 */
const enhanceFigures = () => {
	const content = document.querySelector('.sl-markdown-content');
	if (!content || typeof HTMLDialogElement === 'undefined') return;

	const chinese = document.documentElement.lang.toLowerCase().startsWith('zh');
	const ENLARGE = chinese ? '放大图片' : 'Enlarge image';

	/** The widest candidate the responsive build wrote, not the one this viewport picked. */
	const widest = (image) => {
		let best = { url: image.currentSrc || image.src, width: 0 };
		for (const candidate of image.srcset.split(',')) {
			const [url, descriptor = ''] = candidate.trim().split(/\s+/);
			const width = Number.parseInt(descriptor, 10) || 0;
			if (url && width >= best.width) best = { url, width };
		}
		return best.url;
	};

	let dialog;
	let picture;
	let caption;

	const open = (image) => {
		if (!dialog) {
			dialog = document.createElement('dialog');
			dialog.className = 'am-zoom';
			picture = document.createElement('img');
			caption = document.createElement('p');
			caption.className = 'am-zoom-caption';
			dialog.append(picture, caption);
			// Anywhere in the dialog closes it; Escape already does.
			dialog.addEventListener('click', () => dialog.close());
			document.body.append(dialog);
		}
		picture.src = widest(image);
		picture.alt = image.alt;
		caption.textContent = image.alt;
		dialog.showModal();
	};

	// A figure a reader can open is a control, so it is a button: reachable by
	// keyboard, announced as one, and not confused with a link to somewhere else.
	for (const image of content.querySelectorAll('img')) {
		if (image.closest('a, button')) continue;
		const trigger = document.createElement('button');
		trigger.type = 'button';
		trigger.className = 'am-zoom-trigger';
		trigger.setAttribute('aria-label', `${ENLARGE}: ${image.alt}`);
		image.replaceWith(trigger);
		trigger.append(image);
		trigger.addEventListener('click', () => open(image));
	}
};

// The tag that carries this sits in the document head, so the figures it looks
// for are not parsed yet on a first load.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceFigures);
else enhanceFigures();
