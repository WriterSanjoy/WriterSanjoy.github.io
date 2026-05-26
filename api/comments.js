export default async function handler(req, res) {

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const token = process.env.GITHUB_TOKEN;

const path = "comments/books/book1.json";

if (req.method === "GET") {

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  const fileData = await response.json();

  const comments = JSON.parse(
    Buffer.from(fileData.content, "base64").toString()
  );

  return res.status(200).json(comments);
}

  try {

    const { name, comment, website } = req.body;
    
    if (website) {
      return res.status(403).json({
        success: false,
        message: "Spam detected"
      });
    }

    if (!name || !comment) {
      return res.status(400).json({
        success: false,
        message: "Name and comment required"
      });
    }
    
    if (name.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Name cannot exceed 50 characters"
      });
    }
    
    if (comment.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot exceed 150 characters"
      });
    }
    
    // Read existing file

    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    const fileData = await getResponse.json();

    const comments = JSON.parse(
      Buffer.from(fileData.content, "base64").toString()
    );

    // Add new comment

    comments.unshift({
      name,
      comment,
      date: new Date().toISOString()
    });

    // Save updated file

    const updatedContent = Buffer
      .from(JSON.stringify(comments, null, 2))
      .toString("base64");

    const saveResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
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
          sha: fileData.sha
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

    return res.status(200).json({
      success: true,
      message: "Comment saved successfully"
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
