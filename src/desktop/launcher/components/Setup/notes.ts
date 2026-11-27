// Release notes as HTML. They come from GitHub (a release's body) or the CHANGELOG the app was
// built with, so they are text to show, never markup to run: html stays off (the default), so a
// <tag> in them is shown as text, images are off (the page loads nothing), and a link is its text
// alone, since the app's pages go nowhere (the one way out is "Full notes on GitHub").

import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt().disable('image');
parser.renderer.rules.link_open = () => '';
parser.renderer.rules.link_close = () => '';
// release-please's "### Features": a small-caps label over its list, not a heading
parser.renderer.rules.heading_open = () => '<h3 class="eyebrow mt-3 mb-1 first:mt-0">';
parser.renderer.rules.heading_close = () => '</h3>';

export const notesHtml = (markdown: string) => parser.render(markdown);
