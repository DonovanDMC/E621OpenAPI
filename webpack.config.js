const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");

module.exports = {
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
    })
],
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
};
