export default async function handler(req, res) {

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success:false,
      message:"Method not allowed"
    });
  }

  try {

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    let type;
    let contentId;

    if(req.method === "GET"){

      type = req.query.type;
      contentId = req.query.id;

    } else {

      type = req.body?.type;
      contentId = req.body?.contentId;
    }

    if(
      !['books','blogs'].includes(type)
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid type"
      });
    }

    const allowedContent = {

      books: [
        "book1",
        "book2",
        "book3"
      ],

      blogs: [
        "blog22",
        "blog23"
      ]
    };

    if(
      !allowedContent[type] ||
      !allowedContent[type].includes(contentId)
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid content"
      });
    }

    const filePath =
      `comments/${type}/${contentId}.json`;

    // ═════════ GET ═════════

    if(req.method === "GET"){

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        {
          headers:{
            Authorization:`Bearer ${token}`,
            Accept:"application/vnd.github+json"
          }
        }
      );

      const fileData = await response.json();

      if(!response.ok){

        return res.status(404).json({
          success:false,
          message:fileData.message || "File not found"
        });
      }

      const comments = JSON.parse(
        Buffer
          .from(fileData.content, "base64")
          .toString()
      );

      return res.status(200).json(comments);
    }

    // ═ POST ═

    const {
      name,
      comment,
      rating,
      website
    } = req.body;
// ═ RATE LIMIT ═ Start 

const RATE_LIMIT_SECONDS = 300;

const forwarded =
  req.headers['x-forwarded-for'];

const ip = forwarded
  ? forwarded.split(',')[0]
  : req.socket.remoteAddress;

const ratePath =
  'tmp/rate-limit.json';

// Load current rate data

const rateResponse = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/contents/${ratePath}`,
  {
    headers:{
      Authorization:`Bearer ${token}`,
      Accept:"application/vnd.github+json"
    }
  }
);

const rateFile =
  await rateResponse.json();

if(!rateResponse.ok){

  return res.status(500).json({
    success:false,
    message:"Rate limit storage missing"
  });
}

const rateData = JSON.parse(
  Buffer
    .from(rateFile.content, "base64")
    .toString()
);

const now = Date.now();

if(

  rateData[ip] &&

  (
    now - rateData[ip]
  ) < RATE_LIMIT_SECONDS * 1000

){

  return res.status(429).json({
    success:false,
    message:"Please wait before posting again."
  });
}

// Update timestamp

rateData[ip] = now;

// Save updated rate data

const updatedRateContent = Buffer
  .from(JSON.stringify(rateData, null, 2))
  .toString("base64");

await fetch(
  `https://api.github.com/repos/${owner}/${repo}/contents/${ratePath}`,
  {
    method:"PUT",

    headers:{
      Authorization:`Bearer ${token}`,
      Accept:"application/vnd.github+json",
      "Content-Type":"application/json"
    },

    body:JSON.stringify({
      message:"Update rate limit",
      content:updatedRateContent,
      sha:rateFile.sha
    })
  }
);

// ═ RATE LIMIT ═ End 

    if (website) {
      return res.status(403).json({
        success:false,
        message:"Spam detected"
      });
    }

    if (!name || !comment) {
      return res.status(400).json({
        success:false,
        message:"Name and comment required"
      });
    }

    if (name.length > 50) {
      return res.status(400).json({
        success:false,
        message:"Name too long"
      });
    }

    if (!rating) {
      return res.status(400).json({
        success:false,
        message:"Rating required"
      });
    }

    if (comment.length > 300) {
      return res.status(400).json({
        success:false,
        message:"Comment too long"
      });
    }

    // Read existing comments

    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers:{
          Authorization:`Bearer ${token}`,
          Accept:"application/vnd.github+json"
        }
      }
    );

    const fileData = await getResponse.json();

    if(!getResponse.ok){

      return res.status(404).json({
        success:false,
        message:fileData.message || "File not found"
      });
    }

    const comments = JSON.parse(
      Buffer
        .from(fileData.content, "base64")
        .toString()
    );

    const DEFAULT_REPLY = "অনেক ধন্যবাদ। আপনার মতামত আমার কাছে মূল্যবান।";
    const numericRating =
      Number(rating);
    
    let autoApproved =
      numericRating >= 3;
    
    //═ profanity filter - Start ════════


    
    //═════════ profanity filter - End ════════

    
    comments.unshift({
      name,
      comment,
      rating:numericRating,
      approved:autoApproved,
      
      likes:0,
      
      authorReply:
        type === "books"
          ? DEFAULT_REPLY
          : "",
      date:new Date().toISOString()
    });


    const updatedContent = Buffer
      .from(JSON.stringify(comments, null, 2))
      .toString("base64");

    const saveResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method:"PUT",
        headers:{
          Authorization:`Bearer ${token}`,
          Accept:"application/vnd.github+json",
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          message:"Add reader comment",
          content:updatedContent,
          sha:fileData.sha
        })
      }
    );

    if(!saveResponse.ok){

      const err = await saveResponse.text();

      return res.status(500).json({
        success:false,
        message:err
      });
    }

    return res.status(200).json({
      success:true,
      message:"Comment saved successfully"
    });

  } catch(error){

    return res.status(500).json({
      success:false,
      message:error.message
    });
  }
}
