const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

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
    const source = fs.readFileSync(path.join(pagesDir, file), "utf8");
    const title = source.match(/^# (.+)$/m)?.[1] ?? path.basename(file, ".md");
    return new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "page.html"),
      filename: `${path.basename(file, ".md")}/index.html`,
      chunks: [],
      minify: false,
      templateParameters: { title, content: marked.parse(source) },
    });
  });
}

module.exports = async () => ({
  mode: process.env.NODE_ENV || "development",
  entry: path.resolve(__dirname, "./src/index.ts"),
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
      minify: false
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, "openapi.yaml"), to: "openapi.yaml" },
        { from: path.resolve(__dirname, "openapi.dereferenced.yaml"), to: "openapi.dereferenced.yaml" },
      ],
    }),
    ...await buildPages(),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
});
