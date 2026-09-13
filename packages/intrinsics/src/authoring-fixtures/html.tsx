export const page = (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta httpEquiv="refresh" content="30" />
      <link rel="stylesheet" href="/theme.css" crossorigin="anonymous" />
      <title>Order coffee</title>
    </head>
    <body>
      <main>
        <form action="/orders" method="post" acceptCharset="UTF-8">
          <label for="coffee">Coffee</label>
          <input id="coffee" name="coffee" type="number" min={1} required />
          <select name="size" multiple size="3">
            <optgroup label="Bags">
              <option value="large">Large</option>
            </optgroup>
          </select>
          <fieldset role="radiogroup" aria-orientation="undefined">
            <legend>Roast</legend>
            <label>
              <input type="radio" name="roast" value="dark" />
              Dark
            </label>
            <label>
              <input type="radio" name="roast" value="light" />
              Light
            </label>
          </fieldset>
          <textarea name="message" rows={4} maxlength={500} />
          <button type="submit" formaction="/orders/preview">
            Preview
          </button>
        </form>
        <table>
          <caption>Prices</caption>
          <colgroup span="1" />
          <colgroup>
            <col span="1" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" colspan={2}>
                Coffee
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowspan="2">Decaf</td>
              <td>12</td>
            </tr>
            <tr>
              <td>14</td>
            </tr>
          </tbody>
        </table>
        <section>
          <h2>Order preparation</h2>
          <ol start="2">
            <li value="3">Pack the roasted coffee</li>
          </ol>
          <label for="packing">Packing progress</label>
          <progress id="packing" max="100" value="50" />
          <label for="capacity">Roaster capacity</label>
          <meter id="capacity" min="0" max="100" value="70" optimum="80" />
        </section>
        <picture>
          <source
            srcset="/coffee.webp 1x, /coffee-large.webp 2x"
            type="image/webp"
          />
          <img
            src="/coffee.jpg"
            alt="Roasted coffee"
            width={600}
            height={400}
            loading="lazy"
          />
        </picture>
        <video controls poster="/poster.jpg" preload="metadata">
          <source src="/tour.mp4" type="video/mp4" />
          <track kind="captions" src="/tour.vtt" srclang="en" default />
        </video>
        <div
          style="color: red; margin-top: 1rem"
          innerHTML="<strong>Fresh</strong>"
        />
        <p
          style={{ marginTop: 12, display: "grid", "--coffee-color": "brown" }}
        >
          Freshly roasted
        </p>
        <details open>
          <summary>Delivery</summary>
          <time datetime="2026-09-12">Tomorrow</time>
        </details>
      </main>
    </body>
  </html>
);

// @ts-expect-error Links have href; ordinary paragraphs do not.
export const invalidLink = <p href="/coffee">Coffee</p>;
// @ts-expect-error Input type completion must reject unknown types.
export const invalidInput = <input type="cofee" />;
// @ts-expect-error CSS properties have value types.
export const invalidStyle = <div style={{ display: false }} />;
// @ts-expect-error CSS objects reject misspelled property names.
export const misspelledStyle = <div style={{ colro: "red" }} />;
// @ts-expect-error Raw markup is a string, not a React-specific wrapper.
export const invalidMarkup = <div innerHTML={{ __html: "Hello" }} />;
// @ts-expect-error A bare CMX class uses the standard attribute name.
export const reactClass = <div className="article" />;

// @ts-expect-error Table spans must contain numbers, even when quoted.
export const invalidSpan = <col span="wide" />;
