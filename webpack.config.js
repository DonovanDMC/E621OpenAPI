const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

// Reads the e621ng info that scripts/inject-e621ng-commit.mjs put into the built spec
function readE621ngInfo() {
  const spec = fs.readFileSync(path.resolve(__dirname, "openapi.yaml"), "utf8");
  const field = name => spec.match(new RegExp(`^  x-e621ng-${name}: ["']?(.*?)["']?$`, "m"))?.[1] ?? "";
  return { commit: field("commit"), behindBy: field("master-behind-by"), compareUrl: field("master-compare-url") };
}

// Shared header for every page, active is the path of the current page
function buildHeader(pages, active) {
  const links = [{ href: "/", title: "API Documentation" }, ...pages.map(page => ({ href: `/${page.name}/`, title: page.title }))]
    .map(({ href, title }) => href === active
      ? `<a href="${href}" class="active" aria-current="page">${escapeHtml(title)}</a>`
      : `<a href="${href}">${escapeHtml(title)}</a>`);
  const info = readE621ngInfo();
  return [
    "<header class=\"site-header\">",
    `  <nav class="site-nav" aria-label="Pages">\n    ${links.join("\n    ")}\n  </nav>`,
    `  <div id="e621ng-status" data-commit="${escapeHtml(info.commit)}" data-behind-by="${escapeHtml(info.behindBy)}" data-compare-url="${escapeHtml(info.compareUrl)}"></div>`,
    "</header>",
  ].join("\n");
}

// Each pages/<name>.md is built into /<name>/
async function buildPages() {
  const { Marked } = await import("marked");
  const pagesDir = path.resolve(__dirname, "pages");
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth, text }) {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
    hooks: {
      // Lets wide tables scroll instead of stretching the page
      postprocess: html => html.replaceAll("<table>", "<div class=\"table-wrap\"><table>").replaceAll("</table>", "</table></div>"),
    },
  });

  return fs.readdirSync(pagesDir).filter(file => file.endsWith(".md")).map(file => {
    const name = path.basename(file, ".md");
    const source = fs.readFileSync(path.join(pagesDir, file), "utf8");
    const title = source.match(/^# (.+)$/m)?.[1] ?? name;
    return { name, title, content: marked.parse(source) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

module.exports = async () => {
  const pages = await buildPages();
  const headerStyle = fs.readFileSync(path.resolve(__dirname, "header.css"), "utf8");
  return {
    mode: process.env.NODE_ENV || "development",
    entry: {
      main: path.resolve(__dirname, "./src/index.ts"),
      status: path.resolve(__dirname, "./src/status.ts"),
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.yaml$/,
          use: [
            { loader: "json-loader" },
            { loader: "yaml-loader", options: { asJSON: true } }
          ]
        },
        {
          test: /\.css$/,
          use: [
            { loader: "style-loader" },
            { loader: "css-loader" },
          ]
        }
      ],
    },
    plugins: [
      new CleanWebpackPlugin(),
      new FaviconsWebpackPlugin(path.resolve(__dirname, "icon.png")),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "index.html"),
        chunks: ["status", "main"],
        minify: false,
        templateParameters: { headerStyle, header: buildHeader(pages, "/") },
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: path.resolve(__dirname, "openapi.yaml"), to: "openapi.yaml" },
          { from: path.resolve(__dirname, "openapi.dereferenced.yaml"), to: "openapi.dereferenced.yaml" },
        ],
      }),
      ...pages.map(page => new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "page.html"),
        filename: `${page.name}/index.html`,
        chunks: ["status"],
        minify: false,
        templateParameters: { headerStyle, header: buildHeader(pages, `/${page.name}/`), title: page.title, content: page.content },
      })),
    ],
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "dist"),
    },
  };
};
