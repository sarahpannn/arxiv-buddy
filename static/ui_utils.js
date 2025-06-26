/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Removes null characters from a string.
 * @param {string} str - The input string
 * @returns {string} The string with null characters removed
 */
function removeNullCharacters(str) {
  if (typeof str !== "string") {
    console.warn("removeNullCharacters expects a string");
    return str;
  }
  return str.replace(/\x00/g, "");
}

/**
 * Parses query string parameters
 * @param {string} query - The query string
 * @returns {Map} Map of parameter key-value pairs
 */
function parseQueryString(query) {
  const params = new Map();
  
  if (!query || typeof query !== "string") {
    return params;
  }
  
  // Remove leading # or ? if present
  const cleanQuery = query.replace(/^[#?]/, "");
  
  // Split by & and parse each parameter
  cleanQuery.split("&").forEach(param => {
    const [key, value] = param.split("=");
    if (key) {
      params.set(decodeURIComponent(key), decodeURIComponent(value || ""));
    }
  });
  
  return params;
}

export { removeNullCharacters, parseQueryString };