import "./App.css";
import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Space, message, Image, Progress, Flex, Divider, QRCode, Select } from 'antd';
import { useEffect, useState } from "react";
import { instance } from "./utils/api";
import bilibili from "./assets/BILIBILI_LOGO.svg";
import axios from "axios";
import LocalStorageUtil from "./utils/LocalStorageUtil";
import pay from "./assets/pay.jpg";

function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [search, setSearch] = useState("");
  const [videoInfo, setVideoInfo] = useState({});
  const [resourceUrls, setResourceUrls] = useState([]); // 使用数组存储多个资源链接
  const [progress, setProgress] = useState(0);
  const [downloadState, setDownloadState] = useState(false);
  const [qrcodeUrl, setQrcodeUrl] = useState("");
  const [qrCodeKey, setQrCodeKey] = useState("");
  const [qrCodeVisable, setQrcodVisablel] = useState(false);
  const [timerId, setTimerId] = useState(null);
  const [sensData, setSensData] = useState(null);
  const [selectOption, setSelectOption] = useState("112");
  const [transpferState, setTransferState] = useState(false);
  const [transpferProgress, setTransferProgress] = useState(0);




  useEffect(() => {
    if (qrCodeVisable) {
      instance.get("/getLoginUrl").then(res => {
        setQrcodeUrl(res.data.data.data.url)
        LocalStorageUtil.setItem('qrCodeKey', res.data.data.data.qrcode_key)
        setQrCodeKey(res.data.data.data.qrcode_key)
      })
    }
  }, [qrCodeVisable]);
  useEffect(() => {
    if (qrcodeUrl !== '') {
      const checkQrCodeInterval = setInterval(() => {
        if (qrCodeKey !== '') {
          instance.post("/checkQrCode", { "qrcode_key": qrCodeKey }).then(res => {
            if (res.data.data.data.code === 0) {
              messageApi.success('登录成功');
              clearInterval(checkQrCodeInterval); // 直接在这里清除定时器  
              instance.post("/getcookie", { "url": res.data.data.data.url })
                .then(res => {
                  for (let i = 0; i < res.data.datas.length; i++) {
                    if (res.data.datas[i]["name"] === "SESSDATA") {
                      setSensData(res.data.datas[i]["value"])
                      LocalStorageUtil.setItem('SESSDATA', "SESSDATA=" + res.data.datas[i]["value"])
                    }
                  }
                })
            }
          }).catch(error => {
            console.error('Error checking QR code:', error);
            clearInterval(checkQrCodeInterval); // 在发生错误时也清除定时器  
          });
        }
      }, 2000);

      setTimerId(checkQrCodeInterval); // 设置定时器ID到状态  
    } else if (timerId !== null) {
      clearInterval(timerId); // 如果 qrcodeUrl 为空，且存在定时器，则清除它  
    }

    // 清理函数，确保组件卸载时清除定时器  
    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
      }
    };
  }, [qrCodeKey]);

  const handleSearch = async () => {
    const bv = extractVideoId(search);
    if (bv === null || bv === '') {
      messageApi.info('B站链接解析错误,请检查重试!');
    } else {
      const res = await instance.post("/av", { "bv": bv, "SESSDATA": LocalStorageUtil.getItem('SESSDATA') });
      setVideoInfo(res.data.data);
      const urls = []; // 存储获取的资源链接
      for (let i = 0; i < res.data.data.pages.length; i++) {
        const cid = res.data.data.pages[i].cid;
        const url = await handleCidAid(res.data.data.aid, cid);
        if (url) {
          urls.push(url);
        }
      }
      setResourceUrls(urls); // 设置所有资源链接
    }
  };

  function extractVideoId(url) {
    const regex = /(?:BV)([0-9A-Za-z]+)/;
    const match = url.match(regex);
    return match ? `BV${match[1]}` : null;
  }

  const handleDownloadVideo = async () => {
    if (resourceUrls.length === 0) {
      messageApi.error("没有可下载的资源链接");
      return;
    }

    setDownloadState(true);
    const downloadPromises = resourceUrls.map((url) => {
      return axios.get(url, {
        responseType: "blob",
        onDownloadProgress: evt => {
          setProgress(prev => Math.max(prev, parseInt((evt.loaded / evt.total) * 100))); // 更新最大进度
        }
      });
    });

    try {
      const responses = await Promise.all(downloadPromises);
      responses.forEach((resp, index) => {
        const blobUrl = window.URL.createObjectURL(resp.data);
        const a = document.createElement("a");
        a.download = `${videoInfo.title}_${index + 1}.mp4`; // 添加序号以区分文件
        a.href = blobUrl;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      });
      messageApi.success("下载完成，视频已保存到本地");
      setProgress(0);
    } catch (error) {
      messageApi.error("下载过程中出错，请重试");
    } finally {
      setProgress(0);
      setDownloadState(false);
    }
  };

  const handleCidAid = async (aid, cid) => {
    const res = await instance.post("/download", { aid, cid, "SESSDATA": LocalStorageUtil.getItem('SESSDATA'), "qn": selectOption });
    messageApi.success("资源解析成功");
    return res.data.data.durl[0].url; // 返回单个资源链接
  };

  const handleDownloadMp3 = async () => {
    setTransferProgress(0);
    setTransferState(true);
    setDownloadState(true);
    if (resourceUrls[0]) {
      const videoBlob = await axios.get(resourceUrls[0], {
        responseType: 'blob',
        onDownloadProgress: evt => {
          setProgress(prev => Math.max(prev, parseInt((evt.loaded / evt.total) * 100))); // 更新最大进度
        }
      });
      console.log(videoBlob.data)
      transferVideoToAudio(videoBlob.data);
      setTransferProgress(100);
    }
  };

  const transferVideoToAudio = async (videoBlob) => {
    try {
      const formData = new FormData();
      formData.append('video', videoBlob);
      const response = await instance.post('/transfer', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob' // 设置响应类型为 blob
      });

      // 创建 Blob URL
      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(audioBlob);

      // 创建下载链接并触发下载
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', new Date() + '.mp3'); // 设置下载文件名
      document.body.appendChild(link);
      link.click();

      // 释放 Blob URL
      URL.revokeObjectURL(url);
      document.body.removeChild(link);

      messageApi.success("转换成功")
    } catch (error) {
      messageApi.error("转换失败")
    }
  };



  return (
    <div className="App">
      {contextHolder}
      <div style={{ width: "10%", height: "10%", position: "absolute", top: "50%", right: "0" }}>
        <Image src={pay} preview={false}></Image>
      </div>

      <div className="mainBox">
        <Image src={bilibili} draggable="false" style={{ width: "100%", height: "100%" }} preview={false} />
        <div className="searchBox">
          <Space.Compact style={{ width: "100%", height: "100%" }}>
            <Input placeholder="B站视频连接" value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={handleSearch} />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} >搜索</Button>
          </Space.Compact>
        </div>
        <Divider />
        <div>
          <Select
            defaultValue="16"
            style={{
              width: 150,
              zIndex: 999
            }}
            value={selectOption}
            onChange={(e) => { setSelectOption(e); console.log(e) }}
            options={[
              {
                value: '16',
                label: '流畅 360P',
              },
              {
                value: '64',
                label: '高清 720P',
              },
              {
                value: '80',
                label: '高清 1080P',
              },
              {
                value: '112',
                label: '高清 1080P+',
              },
            ]}
          />
          <Button type="default" onClick={() => { setQrcodVisablel(!qrCodeVisable) }}>B站扫码登录，解锁1080p画质</Button>
        </div>
        {qrCodeVisable && <QRCode type="canvas" value={qrcodeUrl} />}
      </div>
      {JSON.stringify(videoInfo) !== '{}' && (
        <div className="video-info">
          <Flex gap="small">
            <span className="owner">UP主：{videoInfo.owner.name}</span>
            <span className="desc">{videoInfo.title}</span>
          </Flex>
          <div className="operation-box">
            <Button onClick={handleDownloadVideo} type="default">下载视频</Button>
            <Button onClick={handleDownloadMp3} type="default" >下载音频</Button>
          </div>
          {downloadState && <div> 下载进度：<Progress percent={progress} status="active" /></div>}
          {transpferState && <div> 解码进度：<Progress percent={transpferProgress} status="active" /></div>}
        </div>
      )}
    </div>
  );
}

export default App;
