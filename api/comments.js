export default async function handler(req, res) {

  const bannedWords = require("../data/bannedWords");

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {

    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    let type;
    let contentId;

    if (req.method === "GET") {

      type      = req.query.type;
      contentId = req.query.id;

    } else {

      type      = req.body?.type;
      contentId = req.body?.contentId;
    }

    if (!['books', 'blogs'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type"
      });
    }

    if (
      type === "books" &&
      !/^book\d+$/.test(contentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid content"
      });
    }

    if (
      type === "blogs" &&
      !/^blog\d+$/.test(contentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid content"
      });
    }

    const filePath = `comments/${type}/${contentId}.json`;

    // ═════════ GET ═════════

    if (req.method === "GET") {

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json"
          }
        }
      );

      const fileData = await response.json();

      if (!response.ok) {
        return res.status(404).json({
          success: false,
          message: fileData.message || "File not found"
        });
      }

      const comments = JSON.parse(
        Buffer.from(fileData.content, "base64").toString()
      );

      return res.status(200).json(comments);
    }

    // ═════════ POST ═════════

    const { name, comment, rating, website } = req.body;

    // ═════════ RATE LIMIT ═ Start ════════
    // Two separate timers stored in tmp/rate-limit.json:
    //   rateData[ip]          — normal 5-min cooldown after any comment
    //   rateData[ip+"_severe"] — 15-min cooldown after a severe word hit

    const RATE_LIMIT_SECONDS        = 300;  // 5 min — normal
    const SEVERE_RATE_LIMIT_SECONDS = 900;  // 15 min — after severe word

    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress;

    const severeKey = ip + "_severe";
    const ratePath  = 'tmp/rate-limit.json';

    const rateResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${ratePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    const rateFile = await rateResponse.json();

    if (!rateResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "Rate limit storage missing"
      });
    }

    const rateData = JSON.parse(
      Buffer.from(rateFile.content, "base64").toString()
    );

    const now = Date.now();

    // Check severe cooldown first (takes priority)
    if (
      rateData[severeKey] &&
      (now - rateData[severeKey]) < SEVERE_RATE_LIMIT_SECONDS * 1000
    ) {
      const remaining = Math.ceil(
        (SEVERE_RATE_LIMIT_SECONDS - (now - rateData[severeKey]) / 1000) / 60
      );
      return res.status(429).json({
        success:  false,
        severe:   true,
        message:  `আপনার মন্তব্যে অগ্রহণযোগ্য ভাষা ব্যবহার করা হয়েছিল। ${remaining} মিনিট পরে আবার চেষ্টা করুন।`
      });
    }

    // Check normal rate limit
    if (
      rateData[ip] &&
      (now - rateData[ip]) < RATE_LIMIT_SECONDS * 1000
    ) {
      return res.status(429).json({
        success: false,
        message: "Please wait before posting again."
      });
    }

    // ═════════ RATE LIMIT ═ End ════════

    // Honeypot — spam bot trap
    if (website) {
      return res.status(403).json({
        success: false,
        message: "Spam detected"
      });
    }

    // Basic field validation
    if (!name || !comment) {
      return res.status(400).json({
        success: false,
        message: "Name and comment required"
      });
    }

    if (name.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Name too long"
      });
    }

    if (comment.length > 300) {
      return res.status(400).json({
        success: false,
        message: "Comment too long"
      });
    }

    // ─── Rating ───────────────────────────────────────────────────────────────
    // Blogs: hardcoded to 1 (not sent by client, not validated)
    // Books: must be present

    let numericRating;

    if (type === "blogs") {

      numericRating = 1;

    } else {

      if (!rating) {
        return res.status(400).json({
          success: false,
          message: "Rating required"
        });
      }

      numericRating = Number(rating);
    }

    // ─── Read existing comments ────────────────────────────────────────────────

    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    const fileData = await getResponse.json();

    if (!getResponse.ok) {
      return res.status(404).json({
        success: false,
        message: fileData.message || "File not found"
      });
    }

    const comments = JSON.parse(
      Buffer.from(fileData.content, "base64").toString()
    );

    // ─── Moderation: two-tier banned word check ────────────────────────────────
    //
    // TIER 1 — SEVERE (reject + 15-min cooldown, comment not saved)
    //   bannedWords.severe         — explicit slurs, threats, sexual abuse terms
    //   bannedWords.severe_patterns — regex variants of the above
    //
    // TIER 2 — MILD (queue for manual review, comment saved but not visible)
    //   bannedWords.english        — LDNOOBW 403 English words
    //   bannedWords.hindi          — IBW 2176 Hindi/mixed words
    //   bannedWords.bengali        — Bengali Unicode + Romanized 89 terms
    //   bannedWords.patterns       — 17 obfuscation regex patterns
    //
    // Books rating 1–2 always queue regardless of tier 2.

    const lowerComment = comment.toLowerCase();

    // Helper: check word list
    const matchesWordList = (list) =>
      (list || []).some(w => lowerComment.includes(w.toLowerCase()));

    // Helper: check regex patterns
    const matchesPatterns = (patternList) =>
      (patternList || []).some(p => {
        try { return new RegExp(p, 'i').test(comment); }
        catch { return false; }
      });

    const isSevere = (
      matchesWordList(bannedWords.severe) ||
      matchesPatterns(bannedWords.severe_patterns)
    );

    const isMild = !isSevere && (
      matchesWordList(bannedWords.english) ||
      matchesWordList(bannedWords.hindi)   ||
      matchesWordList(bannedWords.bengali) ||
      matchesPatterns(bannedWords.patterns)
    );

    // ── Severe hit: set 15-min cooldown, reject, don't save ───────────────────
    if (isSevere) {

      rateData[severeKey] = now;

      const updatedRateContent = Buffer
        .from(JSON.stringify(rateData, null, 2))
        .toString("base64");

      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${ratePath}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: "Severe word rate limit",
            content: updatedRateContent,
            sha:     rateFile.sha
          })
        }
      );

      return res.status(422).json({
        success: false,
        severe:  true,
        message: "আপনার মন্তব্যে অগ্রহণযোগ্য ভাষা রয়েছে। মন্তব্যটি সংরক্ষণ করা হয়নি। ১৫ মিনিট পরে আবার চেষ্টা করুন।"
      });
    }

    // ── Normal rate limit update (only for non-severe, reaching this point) ───
    rateData[ip] = now;

    const updatedRateContent = Buffer
      .from(JSON.stringify(rateData, null, 2))
      .toString("base64");

    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${ratePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "Update rate limit",
          content: updatedRateContent,
          sha:     rateFile.sha
        })
      }
    );

    // ── Decide approval ────────────────────────────────────────────────────────

    let approved;

    if (type === "books" && numericRating <= 2) {
      approved = false;                  // low-rated book → always queue
    } else {
      approved = !isMild;               // mild word → queue, clean → approve
    }

    // ─── Build and store comment ───────────────────────────────────────────────

    const DEFAULT_REPLY =
      "অনেক ধন্যবাদ। আপনার মতামত আমার কাছে মূল্যবান।";

    comments.unshift({
      name,
      comment,
      rating:      numericRating,
      approved,
      likes:       0,
      authorReply: type === "books" ? DEFAULT_REPLY : "",
      date:        new Date().toISOString()
    });

    const updatedContent = Buffer
      .from(JSON.stringify(comments, null, 2))
      .toString("base64");

    const saveResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "Add reader comment",
          content: updatedContent,
          sha:     fileData.sha
        })
      }
    );

    if (!saveResponse.ok) {
      const err = await saveResponse.text();
      return res.status(500).json({
        success: false,
        message: err
      });
    }

    // ─── Response ──────────────────────────────────────────────────────────────

    if (approved) {
      return res.status(200).json({
        success: true,
        message: "Comment saved successfully"
      });
    } else {
      return res.status(200).json({
        success: true,
        queued:  true,
        message: "Comment saved successfully"
      });
    }

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
